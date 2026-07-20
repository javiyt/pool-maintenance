import { describe, expect, it } from 'vitest';
import {
  composeMeasurementForm,
  createMeasurementDevice,
  deriveTdsFromEc,
  type MeasurementDevice,
} from '../src/domain/measurementDevice';

function photometer(): MeasurementDevice {
  return createMeasurementDevice({
    customName: 'Fotometro',
    deviceType: 'photometer',
    enabled: true,
    isPrimary: true,
    parameters: [{
      parameterCode: 'fac',
      capability: 'direct',
      enabled: true,
      unit: 'ppm',
      resolution: 0.1,
      calibration: { supported: true, lastCalibrationAt: '2026-07-01T10:00:00.000Z' },
    }],
  }, new Date('2026-07-10T10:00:00.000Z'));
}

function digitalMeter(): MeasurementDevice {
  return createMeasurementDevice({
    customName: 'Multiparametro digital',
    deviceType: 'digital-multiparameter',
    enabled: true,
    isPrimary: false,
    parameters: [
      { parameterCode: 'ph', capability: 'direct', enabled: true, unit: 'ph', resolution: 0.01 },
      { parameterCode: 'ec', capability: 'direct', enabled: true, unit: 'us-cm', resolution: 1 },
      {
        parameterCode: 'tds',
        capability: 'calculated',
        enabled: true,
        unit: 'ppm',
        resolution: 1,
        derivation: { sourceParameterCode: 'ec', formulaCode: 'tds-from-ec-linear', conversionFactor: 0.5 },
        temperatureCompensation: { supported: true, enabled: true, referenceTemperatureCelsius: 25 },
      },
    ],
  }, new Date('2026-07-10T10:00:00.000Z'));
}

describe('measurement device composition', () => {
  it('configures multiple meters and composes the form from their capabilities', () => {
    const composition = composeMeasurementForm({
      devices: [photometer(), digitalMeter()],
      poolDisinfection: 'chlorine',
      periodicParameters: ['salt'],
      requestedParameters: ['cya'],
    });

    expect(composition.fields.map((field) => field.parameterCode)).toEqual(expect.arrayContaining([
      'fac',
      'ph',
      'ec',
      'tds',
      'salt',
      'cya',
    ]));
    expect(composition.canEvaluateCompleteSanitation).toBe(true);
    expect(composition.fields.find((field) => field.parameterCode === 'fac')?.devices[0].deviceName).toBe('Fotometro');
    expect(composition.fields.find((field) => field.parameterCode === 'ph')?.devices[0].deviceName).toBe('Multiparametro digital');
  });

  it('marks FAC and pH as blocked when no configured device supports them', () => {
    const composition = composeMeasurementForm({
      devices: [],
      poolDisinfection: 'chlorine',
    });

    expect(composition.missingBasicParameters).toEqual(['ph', 'fac']);
    expect(composition.canEvaluateCompleteSanitation).toBe(false);
    expect(composition.blockedConclusions).toEqual(expect.arrayContaining([
      'seguridad sanitaria completa',
      'correccion de pH',
    ]));
  });

  it('registers TDS derived from EC with a retained conversion factor', () => {
    const composition = composeMeasurementForm({
      devices: [digitalMeter()],
      poolDisinfection: 'chlorine',
    });
    const tds = composition.fields.find((field) => field.parameterCode === 'tds');

    expect(tds?.devices[0].sourceParameterCode).toBe('ec');
    expect(tds?.devices[0].conversionFactor).toBe(0.5);
    expect(deriveTdsFromEc(6640, tds?.devices[0].conversionFactor)).toBe(3320);
  });
});
