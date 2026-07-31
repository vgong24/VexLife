export async function loadBrowserBundle(root = '../../') {
  async function fetchJson(relativePath) {
    const response = await fetch(`${root}${relativePath}`);
    if (!response.ok) throw new Error(`Unable to load ${relativePath}: HTTP ${response.status}`);
    return response.json();
  }
  async function loadComposedBlueprint() {
    const descriptor = await fetchJson('blueprint/vexlife.blueprint.json');
    if (!descriptor.includes) return descriptor;
    const output = Object.fromEntries(Object.entries(descriptor).filter(([key]) => key !== 'includes' && key !== 'composition'));
    for (const [field, source] of Object.entries(descriptor.includes)) {
      if (Array.isArray(source)) {
        const fragments = await Promise.all(source.map(fetchJson));
        output[field] = fragments.every(Array.isArray) ? fragments.flat() : fragments;
      } else output[field] = await fetchJson(source);
    }
    return output;
  }
  const [blueprint, designTokens, en, zh, ja] = await Promise.all([
    loadComposedBlueprint(),
    fetchJson('blueprint/design-tokens.json'),
    fetchJson('blueprint/strings/en.json'),
    fetchJson('blueprint/strings/zh.json'),
    fetchJson('blueprint/strings/ja.json')
  ]);
  return { blueprint, designTokens, catalogs: { en, zh, ja } };
}

// [VXG RealForever]
