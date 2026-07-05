import { describe, it, expect, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { osRoutingRouter, optimizeRoute, dbMock, getOSStatus, OS } from '../../routes/osRouting';

const app = express();
app.use(express.json());
app.use('/api/os', osRoutingRouter);

describe('osRouting', () => {

  beforeEach(() => {
    dbMock.osList = [];
    dbMock.checkins = [];
  });

  it('1. optimize-route com 3 OSs → retorna sequência que minimiza distância (não a ordem original)', async () => {
    const oss: OS[] = [
      { id: '1', address: 'Rua A', client: 'C1', status: 'pendente' }, // lat: 0
      { id: '2', address: 'Rua B', client: 'C2', status: 'pendente' }, // lat: 10
      { id: '3', address: 'Rua C', client: 'C3', status: 'pendente' }, // lat: 2
    ];

    const optimized = await optimizeRoute(oss);
    
    // Expected optimal sequence starting from Rua A: Rua C (dst 2), then Rua B (dst 8).
    expect(optimized.length).toBe(3);
    expect(optimized[0].id).toBe('1'); // Rua A
    expect(optimized[1].id).toBe('3'); // Rua C
    expect(optimized[2].id).toBe('2'); // Rua B
    
    // Test the API as well
    const res = await request(app).post('/api/os/optimize-route').send({ oss });
    expect(res.body.route[1].id).toBe('3');
  });

  it('2. Algoritmo com 1 OS → retorna sem erro', async () => {
    const oss: OS[] = [
      { id: '1', address: 'Rua A', client: 'C1', status: 'pendente' }
    ];

    const optimized = await optimizeRoute(oss);
    expect(optimized.length).toBe(1);
    expect(optimized[0].id).toBe('1');
    
    const res = await request(app).post('/api/os/optimize-route').send({ oss });
    expect(res.body.route.length).toBe(1);
  });

  it('3. Geocoding falha para 1 endereço → OS incluída no final sem quebrar o algoritmo', async () => {
    const oss: OS[] = [
      { id: '1', address: 'Rua A', client: 'C1', status: 'pendente' },
      { id: '2', address: 'geofail', client: 'C2', status: 'pendente' }, // Invalid address
      { id: '3', address: 'Rua C', client: 'C3', status: 'pendente' }
    ];

    const optimized = await optimizeRoute(oss);
    expect(optimized.length).toBe(3);
    expect(optimized[0].id).toBe('1');
    expect(optimized[1].id).toBe('3'); // valid comes first
    expect(optimized[2].id).toBe('2'); // geofail goes exactly to the end
  });

  it('4. GET /api/os/checkins com tenant inválido → 0 resultados (não vaza dados)', async () => {
    dbMock.checkins = [
      { tenantId: 'tenant1', osId: '1' },
      { tenantId: 'invalid', osId: '2' }, // should be handled by logic
    ];

    const res = await request(app).get('/api/os/checkins?tenantId=invalid');
    expect(res.status).toBe(200);
    expect(res.body.checkins).toEqual([]); // 0 results
  });

  it('5. OS com checkout registrado → status=concluído na listagem do supervisor', () => {
    const os: OS = {
      id: '1',
      address: 'Rua A',
      client: 'C1',
      status: 'pendente',
      checkinTime: new Date(Date.now() - 1000 * 60 * 60 * 2), // 2h ago
      checkoutTime: new Date()
    };
    
    const statusUpdated = getOSStatus(os);
    expect(statusUpdated.status).toBe('concluído');
  });

  it('6. OS sem checkout após 8h → status=em campo com alerta visual', () => {
    const os: OS = {
      id: '1',
      address: 'Rua A',
      client: 'C1',
      status: 'pendente',
      checkinTime: new Date(Date.now() - 1000 * 60 * 60 * 9), // 9h ago
      checkoutTime: undefined
    };
    
    const statusUpdated = getOSStatus(os);
    expect(statusUpdated.status).toBe('em campo');
    expect(statusUpdated.alert).toBe(true);
  });
});
