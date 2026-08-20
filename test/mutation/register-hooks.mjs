import { registerHooks } from 'node:module';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const projectRoot = fileURLToPath(new URL('../..', import.meta.url));
const mutation = JSON.parse(process.env.POSTCSS_CALC_MUTATION);
const targetUrl = pathToFileURL(join(projectRoot, mutation.file)).href;

registerHooks({
  load(url, context, nextLoad) {
    const result = nextLoad(url, context);
    if (url !== targetUrl || result.format !== 'module') return result;

    const source = String(result.source);
    const mutated = source.replace(mutation.find, mutation.replace);
    if (mutated === source) {
      throw new Error(`Mutation did not match: ${mutation.name}`);
    }
    return { ...result, source: mutated };
  },
});
