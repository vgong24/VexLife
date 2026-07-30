#!/usr/bin/env node
import { loadBlueprint, visibleStringRefs } from '../src/core/blueprint.mjs';

const bundle = loadBlueprint();
const required = visibleStringRefs(bundle.blueprint, bundle.experience);
for (const feature of bundle.featureRegistry.features ?? []) for (const ref of feature.localizationRefs ?? []) if (!required.includes(ref)) required.push(ref);
required.sort();
const errors = [];
for (const locale of bundle.blueprint.product.requiredLanguages) {
  const catalog = bundle.strings[locale] ?? {};
  for (const ref of required) if (!(ref in catalog)) errors.push(`${locale} missing ${ref}`);
}
console.log(JSON.stringify({ state: errors.length ? 'LOCALIZATION_COVERAGE_INVALID' : 'LOCALIZATION_COVERAGE_VALID', languages: bundle.blueprint.product.requiredLanguages, requiredStrings: required.length, errors }, null, 2));
if (errors.length) process.exitCode = 1;

// [VXG RealForever]
