interface ContentMessage {
  type: "voicenav_ping" | "voicenav_get_page" | "voicenav_action";
  action?: string;
  params?: Record<string, string>;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function getVisibleText(): string {
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const el = node.parentElement;
      if (!el) return NodeFilter.FILTER_REJECT;
      const style = getComputedStyle(el);
      if (style.display === "none" || style.visibility === "hidden")
        return NodeFilter.FILTER_REJECT;
      const tag = el.tagName.toLowerCase();
      if (["script", "style", "noscript", "svg"].includes(tag))
        return NodeFilter.FILTER_REJECT;
      return node.textContent?.trim()
        ? NodeFilter.FILTER_ACCEPT
        : NodeFilter.FILTER_REJECT;
    },
  });
  const texts: string[] = [];
  while (walker.nextNode()) {
    const t = walker.currentNode.textContent?.trim();
    if (t) texts.push(t);
  }
  return texts.join("\n").slice(0, 5000);
}

function getInteractiveElements(): string {
  const items: string[] = [];

  document
    .querySelectorAll("input:not([type=hidden]), textarea, select")
    .forEach((el) => {
      const rect = (el as HTMLElement).getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      const tag = el.tagName.toLowerCase();
      const type = el.getAttribute("type") || "";
      const ph = el.getAttribute("placeholder") || "";
      const name = el.getAttribute("name") || "";
      const label = el.getAttribute("aria-label") || "";
      const id = el.id || "";
      const val = (el as HTMLInputElement).value || "";
      let desc = `[${tag}${type ? " type=" + type : ""}]`;
      if (ph) desc += ` placeholder="${ph}"`;
      if (label) desc += ` aria-label="${label}"`;
      if (name) desc += ` name="${name}"`;
      if (id) desc += ` id="${id}"`;
      if (val) desc += ` value="${val}"`;
      items.push(desc);
    });

  document
    .querySelectorAll(
      "button, [role=button], input[type=submit], input[type=button], a[href]"
    )
    .forEach((el) => {
      const rect = (el as HTMLElement).getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      const text =
        (el as HTMLElement).innerText?.trim().slice(0, 60) ||
        (el as HTMLInputElement).value?.trim() ||
        el.getAttribute("aria-label")?.trim() ||
        "";
      if (!text) return;
      const tag = el.tagName.toLowerCase();
      const href = tag === "a" ? (el as HTMLAnchorElement).href : "";
      let desc = `[${tag === "a" ? "link" : "button"}] "${text}"`;
      if (href) desc += ` href="${href}"`;
      items.push(desc);
    });

  return items.slice(0, 80).join("\n");
}

function findClickable(text: string): HTMLElement | null {
  const lower = text.toLowerCase();
  const clickables = document.querySelectorAll(
    "a, button, [role=button], input[type=submit], input[type=button], [onclick], [tabindex]"
  );
  for (const el of clickables) {
    const rect = (el as HTMLElement).getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) continue;
    const t =
      (el as HTMLElement).innerText?.toLowerCase().trim() ||
      (el as HTMLInputElement).value?.toLowerCase().trim() ||
      el.getAttribute("aria-label")?.toLowerCase().trim();
    if (t && t.includes(lower)) return el as HTMLElement;
  }
  const all = document.querySelectorAll("*");
  for (const el of all) {
    const rect = (el as HTMLElement).getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) continue;
    const t = (el as HTMLElement).innerText?.toLowerCase().trim();
    if (t && t === lower && el.children.length === 0) {
      return el as HTMLElement;
    }
  }
  return null;
}

function findInput(
  params: Record<string, string>
): HTMLInputElement | HTMLTextAreaElement | null {
  if (params.selector)
    return document.querySelector(params.selector) as HTMLInputElement | null;
  if (params.placeholder) {
    const lower = params.placeholder.toLowerCase();
    for (const el of document.querySelectorAll(
      "input, textarea, [contenteditable], [role=textbox], [role=combobox], [role=searchbox]"
    )) {
      const rect = (el as HTMLElement).getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;
      const ph = el.getAttribute("placeholder")?.toLowerCase() || "";
      const label = el.getAttribute("aria-label")?.toLowerCase() || "";
      const dataRef = el.getAttribute("data-ref")?.toLowerCase() || "";
      if (ph.includes(lower) || label.includes(lower) || dataRef.includes(lower))
        return el as HTMLInputElement;
    }
  }
  if (params.label) {
    const lower = params.label.toLowerCase();
    const labels = document.querySelectorAll("label");
    for (const lbl of labels) {
      if (lbl.innerText?.toLowerCase().includes(lower)) {
        const forId = lbl.getAttribute("for");
        if (forId) {
          const input = document.getElementById(forId) as HTMLInputElement;
          if (input) return input;
        }
        const input = lbl.querySelector("input, textarea") as HTMLInputElement;
        if (input) return input;
      }
    }
    for (const el of document.querySelectorAll("input, textarea")) {
      const rect = (el as HTMLElement).getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;
      const parent = el.closest("[class*=field], [class*=form], [class*=input]");
      if (parent && parent.textContent?.toLowerCase().includes(lower))
        return el as HTMLInputElement;
    }
  }
  if (params.name)
    return document.querySelector(
      `[name="${params.name}"]`
    ) as HTMLInputElement | null;
  for (const el of document.querySelectorAll(
    "input:not([type=hidden]), textarea"
  )) {
    const rect = (el as HTMLElement).getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) return el as HTMLInputElement;
  }
  return null;
}

function simulateClick(el: HTMLElement) {
  el.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
  el.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true }));
  el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
}

function findAutocompleteSuggestion(text: string): HTMLElement | null {
  const lower = text.toLowerCase();
  const selectors = [
    "[role=option]",
    "[role=listbox] li",
    "[class*=suggestion]",
    "[class*=dropdown] li",
    "[class*=option]:not(select option)",
    "[class*=autocomplete] li",
    "[class*=result] li",
    "[class*=list] [class*=item]",
    "[data-ref*=suggestion]",
    "[class*=airport]",
    "[class*=city]",
  ];

  for (const sel of selectors) {
    const els = document.querySelectorAll(sel);
    for (const el of els) {
      const rect = (el as HTMLElement).getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;
      const t = (el as HTMLElement).innerText?.toLowerCase().trim();
      if (t && t.includes(lower)) return el as HTMLElement;
    }
  }

  const listItems = document.querySelectorAll("li, [role=option]");
  for (const el of listItems) {
    const rect = (el as HTMLElement).getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) continue;
    const t = (el as HTMLElement).innerText?.toLowerCase().trim();
    if (t && t.includes(lower)) return el as HTMLElement;
  }
  return null;
}

async function execAsync(
  action: string,
  params: Record<string, string>
): Promise<{ success: boolean; data?: string; error?: string }> {
  try {
    switch (action) {
      case "click": {
        let el: HTMLElement | null = params.selector
          ? document.querySelector(params.selector)
          : null;
        if (!el && params.text) el = findClickable(params.text);
        if (!el)
          return {
            success: false,
            error: `Element not found: ${params.text || params.selector}`,
          };
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        await sleep(300);
        simulateClick(el);
        return {
          success: true,
          data: `Clicked: ${el.innerText?.slice(0, 50) || "element"}`,
        };
      }

      case "type": {
        const input = findInput(params);
        if (!input) return { success: false, error: "Input not found" };

        input.scrollIntoView({ behavior: "smooth", block: "center" });
        await sleep(200);

        input.focus();
        await sleep(100);

        const text = params.text || "";

        // Direct value setting using prototype to bypass framework overrides
        // Check if it's a textarea vs input to use the correct prototype
        if (input instanceof HTMLTextAreaElement) {
          const taProto = window.HTMLTextAreaElement.prototype;
          const taValueProp = Object.getOwnPropertyDescriptor(taProto, "value");
          if (taValueProp?.set) {
            taValueProp.set.call(input, text);
          } else {
            input.value = text;
          }
        } else {
          const proto = window.HTMLInputElement.prototype;
          const valueProp = Object.getOwnPropertyDescriptor(proto, "value");
          if (valueProp?.set) {
            valueProp.set.call(input, text);
          } else {
            input.value = text;
          }
        }

        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));

        await sleep(100);

        if (params.submit === "true") {
          await sleep(200);
          const form = input.closest("form");
          if (form) {
            try {
              // Try standard requestSubmit (triggers submit events)
              form.requestSubmit();
            } catch {
              // Fallback to raw submit or looking for a submit button
              const btn = form.querySelector("[type=submit], button:not([type=button])");
              if (btn) (btn as HTMLElement).click();
              else form.submit();
            }
          } else {
            // No form found, try Enter key
            input.dispatchEvent(
              new KeyboardEvent("keydown", {
                key: "Enter",
                code: "Enter",
                keyCode: 13,
                bubbles: true,
                cancelable: true,
              })
            );
          }
          return { success: true, data: `Typed "${text}" and submitted` };
        }

        await sleep(800);

        const suggestion = findAutocompleteSuggestion(text);
        if (suggestion) {
          suggestion.scrollIntoView({ behavior: "smooth", block: "center" });
          await sleep(200);
          simulateClick(suggestion);
          return {
            success: true,
            data: `Typed "${text}" and selected: ${suggestion.innerText?.slice(0, 60)}`,
          };
        }

        return { success: true, data: `Typed "${text}"` };
      }

      case "navigate": {
        if (params.url) {
          window.location.href = params.url;
          return { success: true, data: `Navigating to ${params.url}` };
        }
        return { success: false, error: "No URL" };
      }

      case "scroll": {
        const dir = params.direction || "down";
        const amt = parseInt(params.amount || "500");
        window.scrollBy({
          top: dir === "up" ? -amt : amt,
          behavior: "smooth",
        });
        return { success: true, data: `Scrolled ${dir}` };
      }

      case "read_page":
      case "extract_data":
        return { success: true, data: getVisibleText() };

      default:
        return { success: false, error: `Unknown action: ${action}` };
    }
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

chrome.runtime.onMessage.addListener(
  (msg: ContentMessage, _sender, sendResponse) => {
    if (msg.type === "voicenav_ping") {
      sendResponse({ ok: true });
      return true;
    }
    if (msg.type === "voicenav_get_page") {
      sendResponse({
        url: window.location.href,
        title: document.title,
        content: getVisibleText(),
        interactive: getInteractiveElements(),
      });
      return true;
    }
    if (msg.type === "voicenav_action" && msg.action && msg.params) {
      execAsync(msg.action, msg.params).then(sendResponse);
      return true;
    }
    return false;
  }
);
