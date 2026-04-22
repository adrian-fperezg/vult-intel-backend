const d = new Date("2026-04-22T18:30:00.000Z");
// simulate America/Mexico_City offset (UTC-6) -> 360 minutes
const offset = 360; 
const localDate = new Date(d.getTime() - offset * 60000);
console.log(localDate.toISOString().slice(0, 16));
