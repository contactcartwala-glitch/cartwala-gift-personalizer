window.CartwalaGiftCalendar = (canvas, layout, value) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value || '');
  const year = match ? Number(match[1]) : new Date().getFullYear();
  const month = match ? Number(match[2]) - 1 : 0;
  const day = match ? Number(match[3]) : layout.day || 1;
  const date = new Date(year, month, day);
  if (month < 0 || month > 11 || day < 1 || date.getMonth() !== month) return false;
  const ctx = canvas.getContext('2d'), W = canvas.width, H = canvas.height;
  const ink = layout.color || '#fff2bc';
  ctx.save(); ctx.fillStyle = ink; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = `${W * .035}px "DejaVu Serif", serif`;
  ctx.fillText(new Date(year, month, 1).toLocaleString('en', {month: 'long'}) + ' ' + year, W * layout.monthX / 100, H * layout.monthY / 100);
  ctx.font = `${W * .016}px "DejaVu Sans", sans-serif`;
  const offset = new Date(year, month, 1).getDay();
  const count = new Date(year, month + 1, 0).getDate();
  ['Su','Mo','Tu','We','Th','Fr','Sa'].forEach((label, col) => ctx.fillText(label, W * (layout.x + (col + .5) * layout.width / 7) / 100, H * layout.y / 100));
  for (let number = 1; number <= count; number++) {
    const cell = number - 1 + offset, col = cell % 7, row = Math.floor(cell / 7);
    ctx.fillStyle = number === day ? '#ed442b' : ink;
    ctx.fillText(String(number), W * (layout.x + (col + .5) * layout.width / 7) / 100, H * (layout.y + (row + 1) * layout.height / 6) / 100);
  }
  ctx.restore(); return true;
};
