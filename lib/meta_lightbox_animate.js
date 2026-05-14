(function () {
  globalThis.metaAiCustomAnimate = async function (input) {
    const { prompt, sourceMediaId } = input;
    const customAnimateButton = await waitForButton("Custom animate", 100);
    customAnimateButton?.click();

    const textbox = await waitForTextbox(80);
    if (!textbox) {
      return { ok: false, reason: "Custom animate textbox was not found." };
    }

    setTextboxValue(textbox, prompt);

    await sleep(300);
    const animateButton = findLastEnabledButton("Animate");
    if (!animateButton) {
      return {
        ok: false,
        reason: "Animate submit button was not enabled.",
        buttons: listButtons(),
      };
    }

    const before = location.href;
    animateButton.click();
    for (let i = 0; i < 1200 && location.href === before; i += 1) {
      await sleep(100);
    }

    const after = location.href;
    const videoId = after.match(/\/create\/(\d+)/)?.[1] ?? null;
    return {
      ok: Boolean(videoId && videoId !== sourceMediaId),
      before,
      after,
      videoId,
      reason: videoId === sourceMediaId
        ? "Custom animate stayed on the source media page."
        : undefined,
    };
  };

  async function waitForButton(text, attempts) {
    for (let i = 0; i < attempts; i += 1) {
      const button = findEnabledButton(text);
      if (button) {
        return button;
      }
      await sleep(100);
    }

    return null;
  }

  async function waitForTextbox(attempts) {
    for (let i = 0; i < attempts; i += 1) {
      const textbox = findVisibleTextbox();
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

  function findVisibleTextbox() {
    return [...document.querySelectorAll(
      "textarea, input, [contenteditable=true]",
    )].find(isVisible);
  }

  function findEnabledButton(text) {
    return [...document.querySelectorAll("button")].find((button) =>
      isVisible(button) && getButtonText(button) === text && !button.disabled
    );
  }

  function findLastEnabledButton(text) {
    return [...document.querySelectorAll("button")].reverse().find((button) =>
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

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
})();
