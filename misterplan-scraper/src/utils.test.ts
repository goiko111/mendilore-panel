/**
 * Tests unitarios para utils.ts — corren con `node --test dist/utils.test.js`.
 * No requieren browser ni red.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  mapCanal,
  normalizeHabitacion,
  parseEuros,
  detectMoneda,
  parseDateESP,
  parseDateTimeESP,
  diffNoches,
  calcEstadoCobro,
  inferEstadoReserva,
  splitNombre,
  normalizePais,
  parseIdReserva,
} from './utils.js';

test('mapCanal: known channels', () => {
  assert.equal(mapCanal('Booking.com'), 'booking');
  assert.equal(mapCanal('Cloud (Mi web)'), 'web_propia');
  assert.equal(mapCanal('Airbnb'), 'airbnb');
  assert.equal(mapCanal('Walk-in'), 'walk_in');
  assert.equal(mapCanal('Directa'), 'directo');
  assert.equal(mapCanal('Email'), 'directo');
  assert.equal(mapCanal('Unknown XYZ'), 'otro');
  assert.equal(mapCanal(null), 'otro');
  assert.equal(mapCanal(''), 'otro');
});

test('normalizeHabitacion: matches 6 known', () => {
  assert.equal(normalizeHabitacion('Cala'), 'cala');
  assert.equal(normalizeHabitacion('Habitación NUBE'), 'nube');
  assert.equal(normalizeHabitacion('Margarita Suite'), 'margarita');
  assert.equal(normalizeHabitacion(''), 'otro');
});

test('parseEuros: Spanish format', () => {
  assert.equal(parseEuros('745,00 €'), 745);
  assert.equal(parseEuros('1.234,56€'), 1234.56);
  assert.equal(parseEuros('€745'), 745);
  assert.equal(parseEuros('0,00'), 0);
  assert.equal(parseEuros(null), 0);
  assert.equal(parseEuros(''), 0);
  assert.equal(parseEuros('abc'), 0);
});

test('detectMoneda', () => {
  assert.equal(detectMoneda('745 €'), 'EUR');
  assert.equal(detectMoneda('$50'), 'USD');
  assert.equal(detectMoneda('100 GBP'), 'GBP');
  assert.equal(detectMoneda(''), 'EUR');
  assert.equal(detectMoneda(null), 'EUR');
});

test('parseDateESP', () => {
  assert.equal(parseDateESP('04/06/2026'), '2026-06-04');
  assert.equal(parseDateESP('4/6/2026'), '2026-06-04');
  assert.equal(parseDateESP('texto 31/12/2025 más texto'), '2025-12-31');
  assert.equal(parseDateESP('nada'), '');
  assert.equal(parseDateESP(null), '');
});

test('parseDateTimeESP', () => {
  assert.equal(parseDateTimeESP('06/05/2026 10:26:35'), '2026-05-06T10:26:35Z');
  assert.equal(parseDateTimeESP('06/05/2026 10:26'), '2026-05-06T10:26:00Z');
  assert.equal(parseDateTimeESP('06/05/2026'), '2026-05-06T00:00:00Z');
});

test('diffNoches', () => {
  assert.equal(diffNoches('2026-06-04', '2026-06-07'), 3);
  assert.equal(diffNoches('2026-06-04', '2026-06-04'), 0);
  assert.equal(diffNoches('', '2026-06-07'), 0);
  assert.equal(diffNoches('2026-06-07', '2026-06-04'), 0); // out anterior a in
});

test('calcEstadoCobro', () => {
  assert.equal(calcEstadoCobro(100, 100, 0), 'cobrado');
  assert.equal(calcEstadoCobro(100, 0, 100), 'pendiente');
  assert.equal(calcEstadoCobro(100, 50, 50), 'parcial');
  assert.equal(calcEstadoCobro(100, 0, 100.005), 'pendiente'); // tolerancia
});

test('inferEstadoReserva', () => {
  assert.equal(inferEstadoReserva('2030-01-01', '2030-01-05', false, false), 'confirmada');
  assert.equal(inferEstadoReserva('2020-01-01', '2020-01-05', false, false), 'completada');
  assert.equal(inferEstadoReserva('2030-01-01', '2030-01-05', true, false), 'cancelada');
  assert.equal(inferEstadoReserva('2030-01-01', '2030-01-05', false, true), 'no_show');
});

test('splitNombre', () => {
  assert.deepEqual(splitNombre('Stefan Watson'), { nombre: 'Stefan', apellidos: 'Watson' });
  assert.deepEqual(splitNombre('María José Pérez García'), { nombre: 'María José', apellidos: 'Pérez García' });
  assert.deepEqual(splitNombre('Madonna'), { nombre: 'Madonna', apellidos: null });
  assert.deepEqual(splitNombre(''), { nombre: '', apellidos: null });
  assert.deepEqual(splitNombre('Juan Pérez García'), { nombre: 'Juan', apellidos: 'Pérez García' });
});

test('normalizePais', () => {
  assert.equal(normalizePais('España'), 'ES');
  assert.equal(normalizePais('FRANCIA'), 'FR');
  assert.equal(normalizePais('fr'), 'FR');
  assert.equal(normalizePais('FR'), 'FR');
  assert.equal(normalizePais(null), null);
  assert.equal(normalizePais('Honduras'), 'Honduras'); // unknown stays as-is
});

test('parseIdReserva', () => {
  assert.equal(parseIdReserva('Reserva 1-7328706'), '1-7328706');
  assert.equal(parseIdReserva('Reserva #7328706'), '1-7328706');
  assert.equal(parseIdReserva('  Reserva  7328706  '), '1-7328706');
  assert.equal(parseIdReserva('sin id'), null);
  assert.equal(parseIdReserva(null), null);
});
