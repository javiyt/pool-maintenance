export default function calculateChemicals(measurement, poolVolumeInLiters) {
  const result = {
    chemicals: {},
    instructions: []
  };

  // Formula 1: Lower pH if pH > 7.6
  if (measurement.ph > 7.6) {
    const gramsSodiumBisulfate = Math.round(((measurement.ph - 7.4) / 0.1) * 10 * (poolVolumeInLiters / 1000));
    result.chemicals.sodiumBisulfateGrams = gramsSodiumBisulfate;
    result.instructions.push(`Add ${gramsSodiumBisulfate} grams of sodium bisulfate to lower pH from ${measurement.ph.toFixed(1)} to 7.4`);
  }

  // Formula 2: Add salt if salt < 3000 ppm
  if (measurement.salt < 3000) {
    const kilogramsSalt = ((3400 - measurement.salt) / 100) * 0.1 * (poolVolumeInLiters / 1000);
    result.chemicals.SaltKg = kilogramsSalt;
    result.instructions.push(`Add ${kilogramsSalt.toFixed(2)} kilograms of salt to raise salinity from ${measurement.salt} ppm to 3400 ppm`);
  }

  // Formula 3: Emergency shock chlorination if FAC <= 0.2 OR ORP < 500
  if (measurement.fac <= 0.2 || measurement.ormp < 500) {
    const gramsGranularChlorine = Math.round(2 * 1.5 * (poolVolumeInLiters / 1000));
    result.chemicals.GranularChlorineGrams = gramsGranularChlorine;
    result.instructions.push(`EMERGENCY SHOCK: Add ${gramsGranularChlorine} grams of granular chlorine to raise chlorine by approximately 1.5 ppm`);
  }

  // Formula 4: Alert for high sodium hydroxide production
  if (measurement.ph >= 8.0 && measurement.ormp >= 700) {
    result.instructions.push('Intex Alert: Excess sodium hydroxide production detected. Reduce chlorinator cycle to 1 hour daily.');
  }

  return result;
}
