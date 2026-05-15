(function () {
  globalThis.metaAiCustomAnimate = async function (input) {
    const { prompt, sourceMediaId } = input;
    const customAnimateButton = await waitForButton("Custom animate", 100);
    customAnimateButton?.click();

    const dialog = await waitForDialog("Custom animate", 100);
    if (!dialog) {
      return { ok: false, reason: "Custom animate dialog was not found." };
    }

    const textbox = await waitForTextbox(dialog, 80);
    if (!textbox) {
      return { ok: false, reason: "Custom animate textbox was not found." };
    }

    setTextboxValue(textbox, prompt);

    const animateButton = await waitForButton("Animate", 100, dialog);
    if (!animateButton) {
      return {
        ok: false,
        reason: "Animate submit button was not enabled.",
        buttons: listButtons(),
      };
    }

    return await submitAndReadNewVideoId(
      animateButton,
      sourceMediaId,
      "Custom animate stayed on the source media page.",
    );
  };

  globalThis.metaAiExtendAnimation = async function (input) {
    const { sourceMediaId } = input;
    let extendButton = await waitForButton("Extend", 20);
    if (!extendButton) {
      const extendPanelButton = await waitForButton("Extend animation", 100);
      extendPanelButton?.click();
      extendButton = await waitForButton("Extend", 100);
    }

    if (!extendButton) {
      return {
        ok: false,
        reason: "Extend submit button was not enabled.",
        buttons: listButtons(),
      };
    }

    return await submitAndReadNewVideoId(
      extendButton,
      sourceMediaId,
      "Video extend stayed on the source media page.",
    );
  };

  async function submitAndReadNewVideoId(button, sourceMediaId, staleReason) {
    const consoleCapture = captureConsoleErrors();
    const before = location.href;
    button.click();

    for (let i = 0; i < 1200; i += 1) {
      if (location.href !== before || consoleCapture.errors.length > 0) {
        break;
      }
      await sleep(100);
    }
    consoleCapture.restore();

    const after = location.href;
    const videoId = after.match(/\/create\/(\d+)/)?.[1] ?? null;
    const errorReason = formatConsoleErrorReason(consoleCapture.errors);
    return {
      ok: Boolean(videoId && videoId !== sourceMediaId && !errorReason),
      before,
      after,
      videoId,
      reason: errorReason ??
        (videoId === sourceMediaId ? staleReason : undefined),
    };
  }

  async function waitForDialog(text, attempts) {
    for (let i = 0; i < attempts; i += 1) {
      const dialog = [...document.querySelectorAll('[role="dialog"]')]
        .find((element) =>
          isVisible(element) && element.innerText.includes(text)
        );
      if (dialog) {
        return dialog;
      }
      await sleep(100);
    }

    return null;
  }

  async function waitForButton(text, attempts, root = document) {
    for (let i = 0; i < attempts; i += 1) {
      const button = findEnabledButton(text, root);
      if (button) {
        return button;
      }
      await sleep(100);
    }

    return null;
  }

  async function waitForTextbox(root, attempts) {
    for (let i = 0; i < attempts; i += 1) {
      const textbox = findVisibleTextbox(root);
      if (textbox) {
        return textbox;
      }
      await sleep(100);
    }

    return null;
  }

  function setTextboxValue(textbox, value) {
    if ("value" in textbox) {
      const descriptor = Object.getOwnPropertyDescriptor(
        Object.getPrototypeOf(textbox),
        "value",
      );
      descriptor?.set?.call(textbox, value);
    } else {
      textbox.textContent = value;
    }

    textbox.dispatchEvent(
      new InputEvent("input", {
        bubbles: true,
        inputType: "insertText",
        data: value,
      }),
    );
    textbox.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function findVisibleTextbox(root) {
    return [...root.querySelectorAll(
      "textarea, input, [contenteditable=true]",
    )].find(isVisible);
  }

  function findEnabledButton(text, root = document) {
    return [...root.querySelectorAll("button")].find((button) =>
      isVisible(button) && getButtonText(button) === text && !button.disabled
    );
  }

  function listButtons() {
    return [...document.querySelectorAll("button")].map((button) => ({
      text: getButtonText(button),
      disabled: button.disabled,
      visible: isVisible(button),
    }));
  }

  function getButtonText(button) {
    return (button.innerText || button.getAttribute("aria-label") || "").trim();
  }

  function isVisible(element) {
    return element instanceof HTMLElement && element.offsetParent !== null;
  }

  function captureConsoleErrors() {
    const errors = [];
    const originalError = console.error;
    console.error = (...args) => {
      errors.push(args.map(formatConsoleValue).join(" "));
      originalError.apply(console, args);
    };
    return {
      errors,
      restore() {
        console.error = originalError;
      },
    };
  }

  function formatConsoleErrorReason(errors) {
    const relevant = errors.find((message) =>
      message.includes("DGW imagine stream error") ||
      message.includes("field_exception") ||
      message.includes("Received error response from Clippy")
    );
    return relevant ? `Meta frontend reported: ${relevant}` : null;
  }

  function formatConsoleValue(value) {
    if (value instanceof Error) {
      return value.message;
    }

    if (typeof value === "string") {
      return value;
    }

    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
})();
