const now = new Date();
const wibDateString = now.toLocaleDateString('en-US', { timeZone: 'Asia/Jakarta' });
const [month, day, year] = wibDateString.split('/');
const expiryDate = new Date(`${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T23:59:59+07:00`);
console.log('wibDateString:', wibDateString);
console.log('expiryDate:', expiryDate);
console.log('expiryTimestamp:', Math.floor(expiryDate.getTime() / 1000));
