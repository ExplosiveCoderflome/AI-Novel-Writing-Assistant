export interface WeatherState {
  cloudCover: number;     // 0.0 to 1.0
  rainIntensity: number;  // 0.0 to 1.0
  snowIntensity: number;  // 0.0 to 1.0
  windSpeed: number;      // m/s
  windDirection: string;  // e.g., "NE", "S"
}

export interface EcologicalState {
  soilMoisture: number;       // 0.0 to 1.0
  floraDensity: number;       // 0.0 to 1.0
  preyPopulation: number;     // herbivores population count
  predatorPopulation: number; // predators population count
  rainfall: number;           // current step rainfall contribution
  evaporation: number;        // current step moisture evaporation loss
}

export interface SimulationLocation {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  elevation: number;
  biomeType: string;
  terrainType: string;
  hasRiver: boolean;
  soilMoistureBase: number;
}

export class EarthPhysicsSimulator {
  /**
   * Calculates the base sea-level temperature based on latitude and day of year.
   * Leverages a seasonal approximation model matching Earth's climatic zones.
   */
  public getBaseTempByLatitudeAndDay(latitude: number, dayOfYear: number): number {
    const absLat = Math.abs(latitude);
    
    // Equatorial zone is hot and stable. Polar zone is extremely seasonal and cold.
    const averageTemp = 30 - 0.4 * absLat;
    const seasonalAmplitude = 15 * (absLat / 90);
    
    // Northern hemisphere peaks around day 172 (June 21). 
    // Southern hemisphere is shifted by 182 days.
    const hemisphereMultiplier = latitude >= 0 ? 1 : -1;
    const cosFactor = Math.cos((2 * Math.PI * (dayOfYear - 172)) / 365);
    
    return averageTemp + seasonalAmplitude * cosFactor * hemisphereMultiplier;
  }

  /**
   * Calculates the local physical variables (Temperature, Air Pressure, and Lux)
   * for a location at a specific time step (day and hour).
   */
  public calculateLocPhysics(
    loc: SimulationLocation,
    dayOfYear: number,
    hourOfDay: number,
    weather: WeatherState
  ): { temperature: number; lux: number; airPressure: number } {
    // 1. Calculate Solar Zenith Angle & Daylight
    // Declination Angle (delta)
    const declination = 23.45 * Math.sin(((360 / 365) * (284 + dayOfYear) * Math.PI) / 180);
    
    // Hour Angle (omega) - noon is 0, each hour is 15 degrees
    const hourAngle = (hourOfDay - 12) * 15;
    
    // Solar Zenith Angle (cos(theta) = sin(lat)*sin(dec) + cos(lat)*cos(dec)*cos(omega))
    const latRad = (loc.latitude * Math.PI) / 180;
    const decRad = (declination * Math.PI) / 180;
    const omegaRad = (hourAngle * Math.PI) / 180;
    
    const sinAlt = Math.sin(latRad) * Math.sin(decRad) + Math.cos(latRad) * Math.cos(decRad) * Math.cos(omegaRad);
    const altitudeAngle = Math.asin(Math.max(-1, Math.min(1, sinAlt))) * (180 / Math.PI);
    
    // 2. Map Solar Altitude to Lux (accounting for cloud cover)
    const lux = altitudeAngle <= 0 
      ? 0.1 
      : 120000 * Math.sin((altitudeAngle * Math.PI) / 180) * (1 - weather.cloudCover * 0.8);

    // 3. Lapse Rate Temperature Adjustment (6.5 degrees C drop per 1000m altitude)
    const baseTemp = this.getBaseTempByLatitudeAndDay(loc.latitude, dayOfYear);
    const lapseAdjusted = baseTemp - 0.0065 * loc.elevation;
    
    // 4. Diurnal (Daily) Fluctuation & Weather Modifiers
    // Temperature peaks 3 hours after noon (hour 15, hour angle = 45 degrees)
    const diurnalFluctuation = 6 * Math.sin(((hourAngle - 45) * Math.PI) / 180);
    const rainCooling = weather.rainIntensity * 3;
    const snowCooling = weather.snowIntensity * 8;
    
    const temperature = lapseAdjusted + diurnalFluctuation - rainCooling - snowCooling;

    // 5. Air Pressure (decreases with altitude, standard tropospheric pressure model)
    const airPressure = 101.3 * Math.pow(1 - 0.000022557 * loc.elevation, 5.2559);

    return {
      temperature,
      lux,
      airPressure,
    };
  }

  /**
   * Advances the ecological lifecycle of a location by one step/tick.
   * Simulates soil moisture, vegetation growth, and wildlife food chain.
   */
  public stepEcology(
    loc: SimulationLocation,
    prevEcology: EcologicalState,
    temp: number,
    lux: number,
    weather: WeatherState
  ): EcologicalState {
    // 1. Soil Moisture Balance
    // Moisture gain from rain, base river proximity, and location's base soil moisture
    const rainfallGain = weather.rainIntensity * 0.3;
    const riverGain = loc.hasRiver ? 0.15 : 0.0;
    
    // Evapotranspiration loss (higher temp and light increase evaporation)
    const evapLoss = Math.max(0, 0.015 * ((temp + 15) / 80) * (lux / 120000));
    
    // Plant moisture absorption
    const plantTranspiration = prevEcology.floraDensity * 0.01;
    
    const soilMoisture = Math.max(
      0.0,
      Math.min(
        1.0,
        prevEcology.soilMoisture + rainfallGain + riverGain - evapLoss - plantTranspiration
      )
    );

    // 2. Vegetation (Flora) Lifecycle
    // Best growing temp is around 22°C. Growth depends on soil moisture, light, and warmth.
    const tempGrowthFactor = Math.max(0, 1 - Math.pow((temp - 22) / 20, 2));
    const floraGrowth = tempGrowthFactor * soilMoisture * (lux / 120000) * 0.08;
    
    // Natural decay + grazing consumption
    const herbivoreGrazing = prevEcology.preyPopulation * 0.0002;
    const naturalDecay = 0.005;
    
    const floraDensity = Math.max(
      0.01,
      Math.min(1.0, prevEcology.floraDensity + floraGrowth - naturalDecay - herbivoreGrazing)
    );

    // 3. Wildlife Population (Lotka-Volterra Predator-Prey dynamics)
    let prey = prevEcology.preyPopulation;
    let predator = prevEcology.predatorPopulation;
    
    // Herbivore population rate (capped by vegetation carrying capacity)
    const preyGrowthRate = 0.15 * floraDensity;
    const preyNaturalDeaths = 0.03;
    const preyPredated = 0.002 * predator;
    
    prey = prey * (1 + preyGrowthRate - preyNaturalDeaths - preyPredated);
    
    // Capping prey to prevent infinite explosion in rich biomes
    const maxPreyCapacity = 5000 * floraDensity;
    if (prey > maxPreyCapacity) {
      prey = maxPreyCapacity;
    }

    // Predator population rate (depends on abundance of prey)
    const predatorGrowthFactor = 0.0005 * prey;
    const predatorNaturalDeaths = 0.08; // High starvation rate if no prey
    
    predator = predator * (1 + predatorGrowthFactor - predatorNaturalDeaths);
    
    // Capping predators relative to prey availability
    const maxPredators = Math.max(5, prey * 0.1);
    if (predator > maxPredators) {
      predator = maxPredators;
    }

    return {
      soilMoisture,
      floraDensity,
      preyPopulation: Math.max(5.0, Math.round(prey * 100) / 100),
      predatorPopulation: Math.max(1.0, Math.round(predator * 100) / 100),
      rainfall: rainfallGain,
      evaporation: evapLoss,
    };
  }
}
