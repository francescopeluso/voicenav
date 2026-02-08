import json
import logging
from typing import AsyncGenerator
from openai import AsyncOpenAI
from config import settings
from models.schemas import AgentUpdate, ExecutionPlan, ExecutionStep
from services.voice_output import synthesizer

logger = logging.getLogger(__name__)

_client = None


def _get_client() -> AsyncOpenAI:
    global _client
    if _client is None:
        _client = AsyncOpenAI(api_key=settings.openai_api_key)
    return _client


SYSTEM_PROMPT = """You are VoiceNav, a voice-controlled browser agent. You operate on the user's current web page — reading content, clicking elements, typing into inputs, scrolling, and navigating.

You receive:
1. The user's voice/text command (ORIGINAL REQUEST)
2. The current page's visible text content
3. A list of INTERACTIVE ELEMENTS on the page (inputs, buttons, links with their attributes)
4. A SCREENSHOT of the current page (you can see the layout, colors, and visual elements).
5. A HISTORY of actions you have already taken for this request.
6. A PREVIOUS CONVERSATION HISTORY (if any).

Create a JSON execution plan for the NEXT phase of work.

RULES:
1. BE PROACTIVE. If you need to search, type and submit. If you need to read, scroll and extract.
2. CONTINUOUS EXECUTION: You are in a loop. Do not trying to do everything in one step.
   - If you need to Search -> Plan: [Type "query", Submit]. FINISH. (I will call you again with the search results).
   - If you see search results -> Plan: [Click result OR Read answer].
   - If you found the answer -> Plan: [], final_speech: "The answer is...".
3. ONLY use intent "unclear" if the command is impossible even after multiple steps.
4. For typing, use {placeholder: "..."} or {name: "..."} or {selector: "#id"}. Defaults to submit: false, so set submit: "true" if it's a search.
5. If the user's request is satisfied, return an empty steps list and put the answer in final_speech.
6. USE CONTEXT: If the user refers to "it", "him", "her", or "that", look at the PREVIOUS CONVERSATION HISTORY to resolve the reference.
7. BREVITY IS KEY: 
   - After navigating or searching, simply CONFIRM the location (e.g. "Here is the Wikipedia page for..."). DO NOT read the content unless asked.
   - If asked for information, provide a BRIEF 1-2 sentence summary. Do not read entire paragraphs.
8. PERSISTENCE & AUTONOMY:
   - If you just clicked a search button or link and the new content isn't visible yet, DO NOT GIVE UP. Plan to `read_page` again or `scroll` to see if results load.
   - DYNAMIC PAGES (like travel sites) often hide results. SEARCH DEEPER.
   - Handle "Accept Cookies" or "Close" popups AUTOMATICALLY. Do not ask the user for permission to close them.
   - If you see a list of results that matches the user's request, CLICK the best one immediately. Do not ask "should I click this?".
9. ERROR HANDLING:
   - If an action fails (e.g. "Element not found"), DO NOT TRY THE EXACT SAME ACTION AGAIN. 
   - Try a different selector, scroll to find it, or use `extract_data` to see what is on the page.
   - If you have failed 3 times in a row, STOP and ask the user for help. DO NOT LOOP FOREVER.

Available actions:
- read_page: Analyze the provided page content. Params: {}
- click: Click an element. Params: {text: "visible text"} or {selector: "css selector"}
- type: Type into input. Params: {text: "what to type", ...}, optionally {submit: "true"}. MANDATORY: If user says "Search for...", you MUST set {submit: "true"}.
- scroll: Scroll page. Params: {direction: "up|down", amount: "pixels"}
- navigate: Navigate current tab. Params: {url: "full url"}
- extract_data: Analyze page for specific info. Params: {query: "what to find"}

Respond with ONLY valid JSON:
{
    "intent": "info_extraction" | "navigation" | "interaction" | "unclear",
    "steps": [
        {
            "action": "read_page" | "click" | "type" | "scroll" | "navigate" | "extract_data",
            "params": {},
            "permission_required": "read" | "navigate" | "interact" | null,
            "speech": "Brief description of this step"
        }
    ],
    "final_speech": "Conversational answer or clarification question"
}

Permission tiers:
- read: Default granted. For read_page, extract_data.
- navigate: First-time confirmation. For changing URL.
- interact: Confirmation required. For click, type.

For "unclear" intent: steps must be empty, final_speech asks a specific clarifying question.
For info tasks: put actual findings from the page content in final_speech.

IMPORTANT: You CAN interact with any element listed in the interactive elements section. If you see form fields, you can type into them. If you see buttons, you can click them. Do not say you "can't" do something when the interactive elements show that you can.
"""

DOM_ACTIONS = {"click", "type", "scroll", "navigate", "read_page", "extract_data"}


class VoiceAgent:
    def __init__(self):
        self.granted_permissions: set[str] = {"read", "navigate", "interact"}
        self._plan: ExecutionPlan | None = None
        self._step_idx: int = 0
        self._command: str = ""
        self._history: list[str] = []
        self._turn_count: int = 0
        self._max_turns: int = 20
        self.conversation_history: list[dict] = []

    async def _parse_intent(
        self,
        command: str,
        page_url: str,
        page_title: str,
        page_content: str,
        interactive: str = "",
        page_context: dict = None,
    ) -> ExecutionPlan:
        # Format conversation history for the prompt
        conv_history_str = ""
        if self.conversation_history:
            conv_history_str = "PREVIOUS CONVERSATION:\n" + "\n".join(
                [f"{msg['role'].upper()}: {msg['content']}" for msg in self.conversation_history[-10:]]
            )

        # Format current task action history
        action_history_str = "\n".join([f"- {h}" for h in self._history])

        user_msg = f"""
{conv_history_str}

CURRENT REQUEST:
Command: {command}
(Note: This is the new command. It overrides any previous conversation topics.)
Actions taken in this task so far:
{action_history_str}

Current page:
URL: {page_url}
Title: {page_title}
Content (first 3000 chars):
{page_content[:3000]}

Interactive elements:
{interactive or 'None detected'}
"""
        # Prepare the user message content
        user_content = [{"type": "text", "text": user_msg}]

        # Add screenshot if available
        screenshot = page_context.get("screenshot") if page_context else None
        if screenshot:
            user_content.append({
                "type": "image_url",
                "image_url": {
                    "url": f"data:image/jpeg;base64,{screenshot}",
                    "detail": "low"
                }
            })

        response = await _get_client().chat.completions.create(
            model=settings.gpt_model,
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": user_content},
            ],
            temperature=0.3,
            max_tokens=1500,
        )

        raw = response.choices[0].message.content.strip()
        if raw.startswith("```"):
            raw = raw.split("\n", 1)[1].rsplit("```", 1)[0].strip()

        plan_data = json.loads(raw)
        steps = [ExecutionStep(**s) for s in plan_data.get("steps", [])]
        return ExecutionPlan(
            intent=plan_data["intent"],
            steps=steps,
            final_speech=plan_data.get("final_speech", ""),
        )

    def _needs_permission(self, step: ExecutionStep) -> list[str]:
        if not step.permission_required:
            return []
        if step.permission_required in self.granted_permissions:
            return []
        return [step.permission_required]

    async def start_command(
        self, command: str, page_context: dict = None
    ) -> AsyncGenerator[dict, None]:
        self._command = command
        self._step_idx = 0
        self._plan = None
        self._history = []
        self._turn_count = 0
        
        # Log to conversation history
        self.conversation_history.append({"role": "user", "content": command})

        # Start the loop
        async for update in self._execute_turn(page_context):
            yield update

    async def _execute_turn(self, page_context: dict = None) -> AsyncGenerator[dict, None]:
        if self._turn_count >= self._max_turns:
            yield AgentUpdate(
                status="error",
                speech="I'm sorry, I couldn't complete the task within the limit.",
                audio=await synthesizer.speak("I'm sorry, I couldn't complete the task within the limit."),
            ).model_dump()
            return
        
        # Check for consecutive failures
        consecutive_failures = 0
        for h in reversed(self._history):
            if "failed:" in h:
                consecutive_failures += 1
            else:
                break
        
        if consecutive_failures >= 3:
            logger.warning("Stopping due to consecutive failures")
            error_msg = "I'm having trouble performing this action. I keep failing. Please help me or try a different command."
            self.conversation_history.append({"role": "assistant", "content": error_msg})
            yield AgentUpdate(
                status="error",
                speech=error_msg,
                audio=await synthesizer.speak(error_msg),
            ).model_dump()
            return

        self._turn_count += 1
        
        page_url = page_context.get("url", "") if page_context else ""
        page_title = page_context.get("title", "") if page_context else ""
        page_content = page_context.get("content", "") if page_context else ""
        interactive = page_context.get("interactive", "") if page_context else ""
        screenshot = page_context.get("screenshot", "") if page_context else ""

        # Context Check
        if not page_url and not page_title and not page_content:
            warn_msg = "I can't see the current page. This usually happens on browser setting pages or empty tabs. Please navigate to a website."
            self.conversation_history.append({"role": "assistant", "content": warn_msg})
            yield AgentUpdate(
                status="error",
                speech=warn_msg,
                audio=await synthesizer.speak(warn_msg),
            ).model_dump()
            return

        yield AgentUpdate(
            status="thinking",
            speech="Thinking...",
            audio=None, # excessive audio
        ).model_dump()

        try:
            plan = await self._parse_intent(
                self._command, page_url, page_title, page_content, interactive, page_context
            )
        except Exception as e:
            logger.error(f"Intent parsing failed: {e}")
            err = "Sorry, error processing that."
            yield AgentUpdate(
                status="error", error=str(e), speech=err
            ).model_dump()
            return

        if plan.intent == "unclear" or plan.intent == "finished" or not plan.steps:
            # Log completion to history
            self.conversation_history.append({"role": "assistant", "content": plan.final_speech})
            
            yield AgentUpdate(
                status="complete",
                speech=plan.final_speech,
                audio=await synthesizer.speak(plan.final_speech),
            ).model_dump()
            return

        self._plan = plan
        self._step_idx = 0

        needed_perms: set[str] = set()
        for step in plan.steps:
            needed_perms.update(self._needs_permission(step))

        if needed_perms:
            perm_speech = f"I need permission to {', '.join(needed_perms)} to continue."
            yield AgentUpdate(
                status="permission_request",
                permissions=list(needed_perms),
                speech=perm_speech,
                audio=await synthesizer.speak(perm_speech),
            ).model_dump()
            return

        async for update in self._yield_next_step():
            yield update

    async def action_completed(
        self, result: dict = None, page_context: dict = None
    ) -> AsyncGenerator[dict, None]:
        # Record history
        if self._plan and self._step_idx < len(self._plan.steps):
            last_step = self._plan.steps[self._step_idx]
            status = "success" if result.get("success") else f"failed: {result.get('error')}"
            self._history.append(f"Action: {last_step.action} {last_step.params} -> {status}")

        self._step_idx += 1
        
        # If plan is not done, continue
        if self._plan and self._step_idx < len(self._plan.steps):
             async for update in self._yield_next_step():
                yield update
             return

        # If plan is done, RE-EVALUATE (Loop)
        async for update in self._execute_turn(page_context):
            yield update

    async def _yield_next_step(self) -> AsyncGenerator[dict, None]:
        if not self._plan or self._step_idx >= len(self._plan.steps):
            return

        step = self._plan.steps[self._step_idx]
        total = len(self._plan.steps)

        if step.action in DOM_ACTIONS:
            # Validate params to prevent "undefined" errors
            if step.action == "click" and not step.params.get("text") and not step.params.get("selector"):
                logger.warning(f"Skipping click with no target: {step}")
                self._history.append(f"Action: {step.action} -> skipped (missing target)")
                self._step_idx += 1
                async for update in self._yield_next_step():
                    yield update
                return

            update = AgentUpdate(
                status="executing",
                step=self._step_idx + 1,
                total_steps=total,
                action=step.action,
                speech=step.speech,
            ).model_dump()
            update["params"] = step.params
            update["requires_action"] = True
            yield update
            return

        # Non-DOM actions (internal logic?) - currently not much used but good for structure
        yield AgentUpdate(
            status="executing",
            step=self._step_idx + 1,
            total_steps=total,
            action=step.action,
            speech=step.speech,
        ).model_dump()
        self._step_idx += 1

    def grant_permission(self, permission: str):
        self.granted_permissions.add(permission)
        logger.info(f"Permission granted: {permission}")

    async def resume_after_permission(
        self, command: str, page_context: dict = None
    ) -> AsyncGenerator[dict, None]:
        if self._plan:
            async for update in self._yield_next_step():
                yield update
        else:
             async for update in self._execute_turn(page_context):
                yield update
