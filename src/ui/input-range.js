import Component from './component';
import { createStyle } from './dom/dom';

export default function InputRange(options = {}) {
  const {
    cls = '',
    minValue = 0,
    maxValue = 100,
    initialValue = (minValue + maxValue) / 2,
    step = 1,
    style: styleSettings = {},
    unit = '',
    label = ''
  } = options;

  const style = createStyle(styleSettings);
  let inputEl;

  return Component({
    onInput() {
      this.dispatch('change', { value: inputEl.value });
    },
    onRender() {
      inputEl = document.getElementById(this.getId());
      inputEl.addEventListener('input', this.onInput.bind(this));
      inputEl.addEventListener('change', this.onInput.bind(this)); // ie11
    },
    setValue(value) {
      inputEl = document.getElementById(this.getId());
      if (inputEl !== null) {
        inputEl.value = value;
      }
    },
    render() {
      return `
      <div class="flex no-wrap text-smaller align-center">
        <input id="${this.getId()}" type="range" min="${minValue}" max="${maxValue}" value="${initialValue}" step="${step}" class="${cls}" style="${style}" tabindex="-99" oninput="this.nextElementSibling.value = this.value">
        <output class="padding-left-small text-align-center">${initialValue}</output><div>&nbsp;${unit}</div>
      </div>
      <div class="text-smaller text-align-center padding-smallpadding-top-smallest width-full">${label}</div>
      `;
    }
  });
}
