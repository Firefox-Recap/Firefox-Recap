// /* eslint-disable no-unused-vars */
// async function callBg(fnName, ...args) {
//     const bg = await browser.extension.getBackgroundPage();
//     if (typeof bg[fnName] !== 'function') {
//       throw new Error(fnName + ' is not available on background');
//     }
//     return await bg[fnName](...args);
//   }
//  // dont know if we need this 
//   function render(obj) {
//     document.getElementById('output').textContent =
//       JSON.stringify(obj, null, 2);
//   }
// // dont know if we need this
// function getDays() {
//   const n = parseInt(document.getElementById('days').value, 10);
//   return isNaN(n) || n < 1 ? 1 : n;
// }
// /* eslint-enable no-unused-vars */
