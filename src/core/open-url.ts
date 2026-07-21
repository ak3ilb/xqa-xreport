import { spawn } from 'child_process';

/**
 * Open a local path or URL with the OS default handler.
 * Zero npm dependencies (avoids the `open` package tree for supply-chain scoring).
 */
export function openPathOrUrl(target: string): Promise<void> {
  return new Promise((resolve) => {
    const platform = process.platform;
    let child;
    if (platform === 'darwin') {
      child = spawn('open', [target], { stdio: 'ignore', detached: true });
    } else if (platform === 'win32') {
      child = spawn('cmd', ['/c', 'start', '', target], {
        stdio: 'ignore',
        detached: true,
        windowsHide: true,
      });
    } else {
      child = spawn('xdg-open', [target], { stdio: 'ignore', detached: true });
    }
    child.on('error', () => resolve());
    child.unref();
    resolve();
  });
}
