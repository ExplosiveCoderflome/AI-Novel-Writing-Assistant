const test = require("node:test");
const assert = require("node:assert/strict");
const { EarthPhysicsSimulator } = require("../dist/services/world/EarthPhysicsSimulator.js");

test("EarthPhysicsSimulator - temperature varies by latitude and season", () => {
  const simulator = new EarthPhysicsSimulator();
  
  // Day 172 is Summer Solstice in the Northern Hemisphere (June 21)
  const equatorTemp = simulator.getBaseTempByLatitudeAndDay(0, 172); // Equator
  const arcticTemp = simulator.getBaseTempByLatitudeAndDay(80, 172);  // High latitude
  
  // Equator should be warm and stable, Arctic should be cooler
  assert.ok(equatorTemp > 25 && equatorTemp < 35, `Equator should be warm (~30C), got ${equatorTemp}`);
  assert.ok(arcticTemp < equatorTemp, `Arctic temp ${arcticTemp} should be cooler than Equator ${equatorTemp}`);
  
  // Equator should have no seasonal temperature variation
  const equatorWinterTemp = simulator.getBaseTempByLatitudeAndDay(0, 355); // Winter Solstice
  assert.equal(Math.round(equatorTemp), Math.round(equatorWinterTemp));
});

test("EarthPhysicsSimulator - lapse rate adjusts temperature by elevation", () => {
  const simulator = new EarthPhysicsSimulator();
  
  const lowLoc = {
    id: "low",
    name: "Sea Level Plain",
    latitude: 45,
    longitude: 120,
    elevation: 0, // Sea level
    biomeType: "grassland",
    terrainType: "plain",
    hasRiver: false,
    soilMoistureBase: 0.3
  };
  
  const highLoc = {
    id: "high",
    name: "Mountain Peak",
    latitude: 45,
    longitude: 120,
    elevation: 4000, // 4000 meters altitude
    biomeType: "tundra",
    terrainType: "mountain",
    hasRiver: false,
    soilMoistureBase: 0.3
  };
  
  const weather = {
    cloudCover: 0,
    rainIntensity: 0,
    snowIntensity: 0,
    windSpeed: 0,
    windDirection: "N"
  };
  
  // Calculate physics at noon (Hour 12)
  const lowPhysics = simulator.calculateLocPhysics(lowLoc, 172, 12, weather);
  const highPhysics = simulator.calculateLocPhysics(highLoc, 172, 12, weather);
  
  // Standard lapse rate difference: 4000m * 0.0065 = 26 degrees C drop
  const expectedDrop = 4000 * 0.0065;
  const actualDrop = lowPhysics.temperature - highPhysics.temperature;
  
  assert.ok(Math.abs(actualDrop - expectedDrop) < 0.1, `Temperature drop should be ~26C, got ${actualDrop}`);
  assert.ok(highPhysics.airPressure < lowPhysics.airPressure, "High altitude should have lower air pressure");
});

test("EarthPhysicsSimulator - ecology lifecycle and dry cycle decay", () => {
  const simulator = new EarthPhysicsSimulator();
  
  const loc = {
    id: "plains",
    name: "Temperate Valley",
    latitude: 35,
    longitude: 110,
    elevation: 200,
    biomeType: "deciduous_forest",
    terrainType: "valley",
    hasRiver: false,
    soilMoistureBase: 0.4
  };
  
  let ecologyState = {
    soilMoisture: 0.5,
    floraDensity: 0.4,
    preyPopulation: 100.0,
    predatorPopulation: 10.0,
    rainfall: 0,
    evaporation: 0
  };
  
  const dryWeather = {
    cloudCover: 0.1,
    rainIntensity: 0.0, // No rain
    snowIntensity: 0.0,
    windSpeed: 2.0,
    windDirection: "E"
  };
  
  // Run simulation for 20 steps under dry conditions
  for (let step = 0; step < 20; step++) {
    const physics = simulator.calculateLocPhysics(loc, 172 + Math.floor(step / 24), step % 24, dryWeather);
    ecologyState = simulator.stepEcology(loc, ecologyState, physics.temperature, physics.lux, dryWeather);
  }
  
  // Under zero rain, soil moisture and vegetation (flora) density should drop
  assert.ok(ecologyState.soilMoisture < 0.5, `Soil moisture should have decayed from 0.5, got ${ecologyState.soilMoisture}`);
  assert.ok(ecologyState.floraDensity < 0.4, `Flora density should have decayed from 0.4, got ${ecologyState.floraDensity}`);
});
