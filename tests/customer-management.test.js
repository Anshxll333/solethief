import test from 'node:test';
import assert from 'node:assert/strict';
import { createAdminService } from '../src/services/admin.js';

test('preview customer management aggregates orders and filters users', async () => {
    const service = createAdminService(() => ({ status: 'missing', client: null }));
    const users = await service.listUsers({ search: 'collector' });
    assert.ok(users.length >= 1);
    assert.equal(users[0].email, 'collector@solethief.in');
    const result = await service.setUserBlocked(users[0].id, true, 'risk review');
    assert.equal(result.is_blocked, true);
    assert.equal(result.block_reason, 'risk review');
});

test('live customer operations use protected admin RPCs', async () => {
    const calls = [];
    const service = createAdminService(() => ({
        status: 'configured', client: {
            rpc: async (...args) => { calls.push(args); return { data: [], error: null }; },
        }
    }));
    await service.listUsers({ search: 'a' });
    await service.listSupportTickets({ status: 'open' });
    await service.replyToSupportTicket('ticket-1', 'We are checking this for you.');
    assert.deepEqual(calls, [
        ['admin_list_users', { p_search: 'a' }],
        ['admin_list_support_tickets', { p_status: 'open' }],
        ['admin_reply_support_ticket', { p_ticket_id: 'ticket-1', p_message: 'We are checking this for you.' }],
    ]);
});
