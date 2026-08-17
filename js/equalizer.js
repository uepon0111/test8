import { filters } from './audio.js';
import { $ } from './utils.js';

const presets = {
  flat:   [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  pop:    [-2, -1, 0, 2, 4, 4, 2, 0, -1, -2],
  rock:   [4, 3, 0, -2, -4, -2, 0, 3, 4, 4],
  classic:[0, 0, 0, 0, 0, 0, -2, -4, -4, -6],
  jazz:   [3, 2, 0, 2, -2, -2, 0, 2, 3, 4],
  bass:   [6, 5, 4, 2, 0, 0, 0, 0, 0, 0],
  treble: [0, 0, 0, 0, 0, 0, 2, 4, 5, 6],
  voice:  [-4, -2, 0, 2, 5, 5, 3, 0, -2, -4]
};

export const initEqualizer = () => {
  const container = $('eq-sliders');
  container.innerHTML = '';
  filters.forEach((filter, i) => {
    const col = document.createElement('div');
    col.className = 'eq-slider-col';
    const hz = filter.frequency.value >= 1000 ? (filter.frequency.value/1000)+'k' : filter.frequency.value;
    col.innerHTML = `
      <span>+12</span>
      <input type="range" min="-12" max="12" value="0" data-idx="${i}">
      <span>-12</span>
      <span style="margin-top:5px">${hz}</span>
    `;
    container.appendChild(col);
  });

  const inputs = container.querySelectorAll('input');
  inputs.forEach(input => {
    input.addEventListener('input', e => {
      filters[e.target.dataset.idx].gain.value = e.target.value;
      $('eq-preset').value = 'custom';
    });
  });

  $('eq-preset').addEventListener('change', e => {
    const val = e.target.value;
    if (val !== 'custom') {
      const gains = presets[val];
      inputs.forEach((input, i) => {
        input.value = gains[i];
        filters[i].gain.value = gains[i];
      });
    }
  });
};

