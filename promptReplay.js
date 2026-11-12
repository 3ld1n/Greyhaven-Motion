// Ephemeral, per-chat replay for the *same* user turn when an assistant reply is swiped
// or regenerated. This is intentionally never persisted into the character history.
export function createPromptReplay() {
  let cache = null;
  let justDeleted = false;
  function normalize(type) { return String(type ?? '').toLowerCase(); }
  return {
    remember(text, anchor) {
      const value=String(text || '').trim();
      if (value && anchor) cache={text:value, anchor};
      justDeleted=false;
    },
    restore(type, anchor) {
      if (!cache || !anchor || anchor !== cache.anchor) return null;
      const t=normalize(type);
      if (['swipe', 'regenerate', 'continue'].includes(t) || justDeleted) {
        justDeleted=false;
        return cache.text;
      }
      return null;
    },
    deleted() { justDeleted=true; },
    newUserTurn() { cache=null; justDeleted=false; },
    changeChat() { cache=null; justDeleted=false; },
    inspect() { return cache ? {...cache} : null; },
  };
}
