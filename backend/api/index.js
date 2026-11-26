const { createApp } = require('../apps/api/dist/app.factory');

let appPromise;

function getApp() {
  if (!appPromise) {
    appPromise = createApp();
  }
  return appPromise;
}

module.exports = async function handler(req, res) {
  try {
    const app = await getApp();
    const instance = app.getHttpAdapter().getInstance();
    await new Promise((resolve, reject) => {
      res.once('finish', resolve);
      res.once('close', resolve);
      try {
        instance(req, res);
      } catch (error) {
        reject(error);
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const redacted = message.replace(
      /postgres(?:ql)?:\/\/[^\s]+/gi,
      '[database URL redacted]',
    );
    process.stderr.write(`Fatal request error: ${redacted}\n`);
    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ statusCode: 500, message: 'Internal Server Error' }));
    }
  }
};
