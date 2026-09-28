import { LOCAL_URL, startLocalStack } from './local-stack';

/*
 * Starts the local stack and keeps it running until Ctrl-C, so the recorder can run against it
 * again and again: `npm run stack` in one terminal, `npm run record` in another.
 */
async function main(): Promise<void> {
  // Until the stack is up, Ctrl-C exits at once; the stack's exit handler kills what it started.
  const abort = (): never => process.exit(130);
  process.once('SIGINT', abort);
  process.once('SIGTERM', abort);
  const teardown = await startLocalStack();
  process.off('SIGINT', abort);
  process.off('SIGTERM', abort);
  console.log(`Stack ready at ${LOCAL_URL}. Ctrl-C stops it.`);
  await new Promise<void>((resolve) => {
    process.once('SIGINT', resolve);
    process.once('SIGTERM', resolve);
  });
  console.log('Stopping the stack…');
  await teardown();
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
