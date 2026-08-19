import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchNearbyPoi, searchAddress } from './poiSearch';

describe('poiSearch', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => vi.unstubAllGlobals());

  it('fetchNearbyPoi consulta o Overpass e mapeia os elementos com nome e coordenadas', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        elements: [
          { id: 1, lat: -23.5, lon: -46.6, tags: { name: 'Posto Ipiranga', 'addr:street': 'Av. Paulista', 'addr:housenumber': '100' } },
          { id: 2, lat: -23.6, lon: -46.7, tags: {} },
        ],
      }),
    });

    const result = await fetchNearbyPoi('fuel', { lat: -23.5, lng: -46.6 });

    expect(fetchMock).toHaveBeenCalledWith('https://overpass-api.de/api/interpreter', expect.objectContaining({ method: 'POST' }));
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ name: 'Posto Ipiranga', category: 'fuel', latitude: -23.5, longitude: -46.6, address: 'Av. Paulista, 100' });
    expect(result[1].name).toBe('Postos'); // sem tag name -> cai no label da categoria
  });

  it('fetchNearbyPoi devolve lista vazia se o Overpass falhar', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false });
    await expect(fetchNearbyPoi('pharmacy', { lat: 0, lng: 0 })).resolves.toEqual([]);
  });

  it('fetchNearbyPoi devolve lista vazia numa categoria desconhecida', async () => {
    // @ts-expect-error testando entrada inválida deliberadamente
    await expect(fetchNearbyPoi('nao-existe', { lat: 0, lng: 0 })).resolves.toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('searchAddress consulta o Nominatim e mapeia os resultados', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ([
        { place_id: 9, display_name: 'Rua Augusta, 1200, Consolação, São Paulo', lat: '-23.55', lon: '-46.66' },
      ]),
    });

    const result = await searchAddress('Rua Augusta', { lat: -23.5, lng: -46.6 });

    expect(result).toEqual([
      { id: 'nom-9', name: 'Rua Augusta', category: 'search', latitude: -23.55, longitude: -46.66, address: 'Rua Augusta, 1200, Consolação, São Paulo' },
    ]);
  });

  it('searchAddress não bate a API pra texto muito curto', async () => {
    await expect(searchAddress('')).resolves.toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
