import {pipeline, env} from '@xenova/transformers';

env.allowLocalModels = false;
// Enable caching in the browser's IndexedDB:
env.useBrowserCache = true;

let classifier = null;
let pipelinePromise = null;

/**
 * Load the Multi-label Classifier exactly once. If it's already loading or loaded,
 * we reuse the same pipelinePromise so we don't accidentally create multiple classifiers.
 */
export async function loadModel() {
  if (classifier) {
    return classifier;
  }
  if (pipelinePromise) {
    return pipelinePromise;
  }

  console.log('Loading modernBERT Multi-label Classifier Model');

  pipelinePromise = pipeline(
    'text-classification',
    'tshasan/modernbert-urltitle-classifier-preview',
    {
      // Logs incremental download progress
      progress_callback: (progressObj) => {
        console.log(progressObj);
      },
    },
  )
    .then((loadedPipeline) => {
      console.log('Model Loaded Successfully!');
      classifier = loadedPipeline; // store for all future calls
      return classifier;
    })
    .catch((err) => {
      console.error('Model Loading Failed:', err);
      // If load fails, reset so we can retry on next call
      pipelinePromise = null;
      throw err;
    });

  return pipelinePromise;
}

/**
 * Classify a page with the multi-label classifier
 * @param {string} title - The page title
 * @param {string} url - The page URL (optional)
 * @returns {string[]} Array of categories the page belongs to
 */
export async function classifyPage(title, url = '') {
  // Make sure the model is loading / loaded
  if (!classifier) {
    await loadModel(); // Wait for pipelinePromise if needed
  }

  if (!classifier) {
    console.error('Classifier is still undefined after attempting to load.');
    return ['N/A'];
  }

  const allLabels = [
    'News',
    'Entertainment',
    'Shop',
    'Chat',
    'Education',
    'Government',
    'Health',
    'Technology',
    'Work',
    'Travel',
  ];

  try {
    const input = `URL: ${url} Title: ${title}`;

    // Use the pipeline to classify - returns all labels with their scores
    const result = await classifier(input, {topk: allLabels.length});

    // Filter results to only include labels with score > 0.5 (threshold can be adjusted)
    const detectedCategories = result
      .filter((item) => item.score > 0.5)
      .map((item) => item.label);

    console.log(`Classification Result for "${title}":`, detectedCategories);

    return detectedCategories.length > 0
      ? detectedCategories
      : ['Uncategorized'];
  } catch (error) {
    console.log('no catergory detected');
    return ['Uncategorized'];
  }
}
