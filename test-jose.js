const { SignJWT, jwtVerify } = require('jose');

async function run() {
  const secret = new TextEncoder().encode("v9b3tLg2MvP8nKq4wXy7ZcA1dHj5FmRo6sYtEuIeCbN=");
  const payload = {
    id: "test",
    email: "test@test.com",
    name: "Test User",
    globalRole: "SUPER_ADMIN",
    appRoles: null,
    positionId: null,
    positionName: null,
    departmentId: null,
    departmentName: null,
  };

  const now = new Date();
  const wibDateString = now.toLocaleDateString('en-US', { timeZone: 'Asia/Jakarta' });
  const [month, day, year] = wibDateString.split('/');
  const expiryDate = new Date(`${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T23:59:59+07:00`);
  const expiryTimestamp = Math.floor(expiryDate.getTime() / 1000);

  const token = await new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(expiryTimestamp)
    .sign(secret);
  
  console.log("Token generated:", token);

  try {
    const result = await jwtVerify(token, secret);
    console.log("Verified! Payload:", result.payload);
  } catch (err) {
    console.error("Verification failed:", err);
  }
}
run();
