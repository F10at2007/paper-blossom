/* Navigation uses real links. Unfinished actions explain their status. */
(() => {
  const dialog = document.querySelector('#notice-dialog');
  const message = document.querySelector('#notice-message');
  document.addEventListener('click', (event) => {
    const button = event.target.closest('[data-placeholder]');
    if (!button) return;
    message.textContent = `「${button.dataset.placeholder}」将在后续阶段开放。当前仅展示页面与操作入口，不会修改、保存或下载作品。`;
    dialog.showModal();
  });
  dialog.addEventListener('click', (event) => {
    if (event.target !== dialog) return;
    const bounds = dialog.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) dialog.close();
  });
})();
