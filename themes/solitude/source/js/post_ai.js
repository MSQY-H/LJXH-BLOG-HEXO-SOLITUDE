/* 修改部分(-)
class AIPostRenderer {
  static ANIMATION_DELAY_MS = 30;
  static AI_EXPLANATION_SELECTOR = ".ai-explanation";
  static AI_TAG_SELECTOR = ".ai-tag";

  constructor() {
    this.startTextAnimation = this.startTextAnimation.bind(this);
    this.animationFrame = null;
  }

  init() {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", this.initialize.bind(this));
    } else {
      this.initialize();
    }
  }

  initialize() {
    this.cacheElements();
    this.validateContent() && this.renderAIContent();
  }

  cacheElements() {
    this.refs = new WeakMap();
    this.refs.set(document, {
      explanationElement: document.querySelector(
        AIPostRenderer.AI_EXPLANATION_SELECTOR
      ),
      tagElement: document.querySelector(AIPostRenderer.AI_TAG_SELECTOR),
    });

    const { explanationElement, tagElement } = this.refs.get(document) || {};
    this.explanationElement = explanationElement;
    this.tagElement = tagElement;
  }

  validateContent() {
    return !!(
      this.explanationElement &&
      this.tagElement &&
      this.aiContent.length &&
      !this.isAnimating
    );
  }

  renderAIContent() {
    this.prepareAnimation();
    this.animationFrame = requestAnimationFrame(() =>
      this.startTextAnimation(0)
    );
  }

  prepareAnimation() {
    this.isAnimating = true;
    this.tagElement.classList.add("loadingAI");
    this.explanationElement.textContent = "";
  }

  startTextAnimation(index) {
    if (index >= this.aiContent.length) {
      this.completeAnimation();
      return;
    }

    this.appendCharacter(this.aiContent[index]);
    this.animationFrame = requestAnimationFrame(() =>
      this.startTextAnimation(index + 1)
    );
  }

  appendCharacter(char) {
    if (!this.fragment) this.fragment = document.createDocumentFragment();

    const charElement = document.createElement("span");
    charElement.className = "char";
    charElement.textContent = char;
    this.fragment.appendChild(charElement);

    if (this.fragment.childNodes.length % 1 === 0) {
      this.explanationElement.appendChild(this.fragment);
      this.fragment = null;
    }
  }

  completeAnimation() {
    if (this.fragment) {
      this.explanationElement.appendChild(this.fragment);
      this.fragment = null;
    }

    cancelAnimationFrame(this.animationFrame);
    this.isAnimating = false;
    this.tagElement.classList.remove("loadingAI");

    const event = new CustomEvent("aiRenderComplete", {
      detail: { element: this.explanationElement },
    });
    document.dispatchEvent(event);
  }

  get aiContent() {
    return PAGE_CONFIG?.ai_text || "";
  }
}

const aiPostRenderer = (() => {
  let instance;
  return () => {
    if (!instance) {
      instance = new AIPostRenderer();
      instance.init();
    }
    return instance;
  };
})();

const ai = aiPostRenderer();
*/
//(+)
class AIPostRenderer {
  static ANIMATION_DELAY_MS = 40; // 每个字符之间的延迟（单位：ms）
  static AI_EXPLANATION_SELECTOR = ".ai-explanation"; // 解释容器选择器
  static AI_TAG_SELECTOR = ".ai-tag"; // 标签选择器

  constructor() {
    this.startTextAnimation = this.startTextAnimation.bind(this);
    this.animationFrame = null;
    this.isDeleting = false; // 是否处于删除阶段
  }

  init() {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", this.initialize.bind(this));
    } else {
      this.initialize();
    }
  }

  initialize() {
    this.cacheElements();
    if (this.validateContent()) {
      this.renderAIContent();
    }
  }

  cacheElements() {
    this.refs = new WeakMap();
    this.refs.set(document, {
      explanationElement: document.querySelector(AIPostRenderer.AI_EXPLANATION_SELECTOR),
      tagElement: document.querySelector(AIPostRenderer.AI_TAG_SELECTOR)
    });
    const { explanationElement, tagElement } = this.refs.get(document) || {};
    this.explanationElement = explanationElement;
    this.tagElement = tagElement;
  }

  validateContent() {
    return (
      this.explanationElement &&
      this.tagElement &&
      this.aiContent.length &&
      !this.isAnimating
    );
  }

  renderAIContent() {
    this.prepareAnimation();
    // 延迟3秒后，开始真正执行删除和打字动画
    setTimeout(() => {
      this.explanationElement.style.display = "block"; // 显示解释容器
      this.explanationElement.classList.add("fast-blink"); // 开始快闪
      this.animationFrame = requestAnimationFrame(() =>
        this.startTextAnimation(0)
      );
    }, 3000);
  }

  prepareAnimation() {
    this.isAnimating = true;
    this.isDeleting = true; // 初始化设为删除模式
    this.tagElement.classList.add("loadingAI");
    // 注意这里不加 fast-blink，保持3000ms期间慢闪
  }

  startTextAnimation(index) {
    if (this.isDeleting) {
      // 删除阶段
      const currentText = this.explanationElement.textContent;
      if (currentText.length > 0) {
        this.explanationElement.textContent = currentText.slice(0, -1); // 删除最后一个字
        setTimeout(() => {
          this.animationFrame = requestAnimationFrame(() =>
            this.startTextAnimation(index)
          );
        }, AIPostRenderer.ANIMATION_DELAY_MS);
      } else {
        this.isDeleting = false; // 删除完成，开始打字
        this.startTextAnimation(0);
      }
    } else {
      // 打字阶段
      if (index >= this.aiContent.length) {
        this.completeAnimation(); // 打字完成
      } else {
        this.explanationElement.textContent += this.aiContent[index]; // 添加下一个字符
        setTimeout(() => {
          this.animationFrame = requestAnimationFrame(() =>
            this.startTextAnimation(index + 1)
          );
        }, AIPostRenderer.ANIMATION_DELAY_MS);
      }
    }
  }

  completeAnimation() {
    cancelAnimationFrame(this.animationFrame);
    this.isAnimating = false;
    this.tagElement.classList.remove("loadingAI");
    this.explanationElement.classList.remove("fast-blink"); // 打字完成后恢复慢闪
    const event = new CustomEvent("aiRenderComplete", {
      detail: { element: this.explanationElement }
    });
    document.dispatchEvent(event);
  }

  get aiContent() {
    return PAGE_CONFIG?.ai_text || "";
  }
}

// 单例模式，避免重复初始化
const aiPostRenderer = (() => {
  let instance;
  return () => {
    if (!instance) {
      instance = new AIPostRenderer();
      instance.init();
    }
    return instance;
  };
})();

// 初始化
const ai = aiPostRenderer();
//结束