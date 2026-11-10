import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const root = resolve(process.argv[2] ?? '');
if (root !== '/private/tmp/nutriscan-scan-benchmark') {
  throw new Error('Dataset destination must be /private/tmp/nutriscan-scan-benchmark');
}
const hiddenIngredient =
  /\b(salt|pepper|oil|vinegar|sugar|juice|sauce|dressing|seasoning|spice|water|butter|mayonnaise|ketchup|mustard)\b/i;

async function download(url, destination) {
  try {
    await access(destination);
    return true;
  } catch {
    // Download below.
  }
  const response = await fetch(url);
  if (!response.ok) return false;
  await writeFile(destination, Buffer.from(await response.arrayBuffer()));
  return true;
}

function stableSample(items, count) {
  if (items.length <= count) return items;
  return Array.from(
    { length: count },
    (_, index) => items[Math.floor((index * items.length) / count)],
  );
}

await mkdir(join(root, 'images', 'food'), { recursive: true });
await mkdir(join(root, 'images', 'nonfood'), { recursive: true });

const testIds = new Set(
  (await readFile(join(root, 'rgb_test_ids.txt'), 'utf8')).trim().split(/\s+/),
);
const nutritionRows = (
  await Promise.all(
    ['dish_metadata_cafe1.csv', 'dish_metadata_cafe2.csv'].map((file) =>
      readFile(join(root, file), 'utf8'),
    ),
  )
).flatMap((file) => file.trim().split('\n'));
const nutritionCandidates = nutritionRows
  .map((line) => {
    const fields = line.split(',');
    const allItems = [];
    for (let index = 6; index + 6 < fields.length; index += 7) {
      const name = fields[index + 1]?.trim();
      const grams = Number(fields[index + 2]);
      if (name && !/^deprecated$/i.test(name) && !hiddenIngredient.test(name)) {
        const cleanName = name.replace(/\s*\([^)]*\)\s*/g, ' ').trim();
        allItems.push({
          name: cleanName,
          aliases: cleanName === name ? [] : [name],
          grams: Math.round(grams * 10) / 10,
        });
      }
    }
    const items = allItems.filter(({ grams }) => grams >= 12);
    const acceptableItems = allItems.filter(({ grams }) => grams < 12);
    return { id: fields[0], items, acceptableItems };
  })
  .filter(({ id, items }) => id && testIds.has(id) && items.length > 0)
  .sort((left, right) => left.id.localeCompare(right.id));

const strata = [
  nutritionCandidates.filter(({ items }) => items.length === 1),
  nutritionCandidates.filter(({ items }) => items.length === 2),
  nutritionCandidates.filter(({ items }) => items.length === 3),
  nutritionCandidates.filter(({ items }) => items.length >= 4),
];
const foodCases = [];
for (const [stratumIndex, stratum] of strata.entries()) {
  for (const candidate of stableSample(stratum, Math.min(stratum.length, 70))) {
    if (foodCases.filter((item) => item.stratumIndex === stratumIndex).length >= 30) break;
    const sourceUrl = `https://storage.googleapis.com/nutrition5k_dataset/nutrition5k_dataset/imagery/realsense_overhead/${candidate.id}/rgb.png`;
    const relativePath = `images/food/${candidate.id}.png`;
    if (await download(sourceUrl, join(root, relativePath))) {
      foodCases.push({
        id: `nutrition5k-${candidate.id}`,
        containsFood: true,
        expectedItems: candidate.items,
        acceptableItems: candidate.acceptableItems,
        imagePath: relativePath,
        sourceUrl,
        stratumIndex,
      });
    }
  }
}

const coco = JSON.parse(
  await readFile(join(root, 'annotations', 'instances_val2017.json'), 'utf8'),
);
const excludedNames = new Set([
  'bottle',
  'wine glass',
  'cup',
  'fork',
  'knife',
  'spoon',
  'bowl',
  'dining table',
]);
const excludedCategoryIds = new Set(
  coco.categories
    .filter(({ name, supercategory }) => supercategory === 'food' || excludedNames.has(name))
    .map(({ id }) => id),
);
const annotationsByImage = new Map();
for (const annotation of coco.annotations) {
  const current = annotationsByImage.get(annotation.image_id) ?? [];
  current.push(annotation);
  annotationsByImage.set(annotation.image_id, current);
}
const nonFoodCandidates = coco.images
  .filter((image) => {
    const annotations = annotationsByImage.get(image.id) ?? [];
    return (
      annotations.length > 0 &&
      annotations.every(({ category_id }) => !excludedCategoryIds.has(category_id)) &&
      annotations.some(({ area }) => area / (image.width * image.height) >= 0.12)
    );
  })
  .sort((left, right) => left.id - right.id);

const nonFoodCases = [];
for (const image of stableSample(nonFoodCandidates, 50)) {
  if (nonFoodCases.length >= 30) break;
  const sourceUrl = `https://images.cocodataset.org/val2017/${image.file_name}`;
  const relativePath = `images/nonfood/${image.file_name}`;
  if (await download(sourceUrl, join(root, relativePath))) {
    nonFoodCases.push({
      id: `coco-${image.id}`,
      containsFood: false,
      expectedItems: [],
      imagePath: relativePath,
      sourceUrl,
    });
  }
}

const cases = [
  ...foodCases.map(({ stratumIndex: _stratumIndex, ...value }) => value),
  ...nonFoodCases,
];
if (foodCases.length !== 120 || nonFoodCases.length !== 30 || cases.length !== 150) {
  throw new Error(
    `Dataset incomplete: food=${foodCases.length}, nonfood=${nonFoodCases.length}, total=${cases.length}`,
  );
}
await writeFile(
  join(root, 'manifest.json'),
  `${JSON.stringify(
    {
      version: 1,
      generatedAt: new Date().toISOString(),
      notes: [
        'Nutrition5k RGB test split; visible-food proxy keeps ingredients >=12 g and removes hidden condiments.',
        'COCO negatives exclude all annotated food and dining-container categories and require a large labeled non-food object.',
      ],
      cases,
    },
    null,
    2,
  )}\n`,
);
console.log(
  JSON.stringify({ food: foodCases.length, nonfood: nonFoodCases.length, total: cases.length }),
);
