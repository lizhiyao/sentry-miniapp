const replace = require('replace-in-file');
const packageJson = require(`${process.cwd()}/package.json`);

const files = process.argv.slice(2);
if (files.length === 0) {
  console.error('Please provide files to bump');
  process.exit(1);
}

replace({
  files: files,
  from: /\d+\.\d+.\d+(?:-\w+(?:\.\w+)?)?/g,
  to: packageJson.version,
})
  .then(([{ file, hasChanged }]) => {
    console.log('Modified files:', file, hasChanged);
  })
  .catch(error => {
    console.error('Error occurred:', error);
    process.exit(1);
  });
