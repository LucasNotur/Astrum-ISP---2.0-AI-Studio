export function createMockTenant(overrides: any = {}) {
    return {
        id: "tenant-123",
        name: "Test Tenant",
        evolution_api_url: "http://evolution.example",
        evolution_api_instance: "test_instance",
        evolution_api_key: "test_key",
        ...overrides
    };
}

export function createMockTicket(overrides: any = {}) {
    return {
        id: "ticket-123",
        tenantId: "tenant-123",
        phone_number: "5511999999999@s.whatsapp.net",
        status: "open",
        createdAt: new Date().toISOString(),
        ...overrides
    };
}

export function createMockCustomer(overrides: any = {}) {
    return {
        id: "cust-123",
        tenantId: "tenant-123",
        phone: "5511999999999",
        name: "John Doe",
        lgpd_status: "accepted",
        ...overrides
    };
}
