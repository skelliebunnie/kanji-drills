const optionsForm = document.getElementById('options');
const repsInput = document.getElementById('reps');
const kanjiOnlyInput = document.getElementById('kanji-only');
const strokeOrderInput = document.getElementById('stroke-order');

let options = loadOptions() || {
  reps: 4,
  kanjiOnly: false,
  strokeOrder: false
};

function loadOptions() {
  try { return JSON.parse(localStorage.getItem('options') ?? '{}'); }
  catch { return {}; }
}
function saveOptions() {
  try { 
    localStorage.setItem('options', JSON.stringify(options)); 
  } catch (err) {
    console.error('Failed to save options:', err);
  }
}

function getOptions() {
  let opt = {
    reps: parseInt(repsInput.value) || 4,
    kanjiOnly: kanjiOnlyInput.checked,
    strokeOrder: strokeOrderInput.checked
  };
  saveOptions();
  return opt;
}