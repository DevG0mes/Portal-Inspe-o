import { randomUUID } from 'node:crypto';
import { expect, it, vi } from 'vitest';
import { Queue, QueueEvents, Worker } from 'bullmq';
import { Redis } from 'ioredis';
import { createTestDatabase } from '../../api/test/helpers/test-database.js';
import { createSchedulingRuntime } from '@portal/api/scheduling';
import {
  InspectionSchedule,
  InspectionAssignment,
  ScheduleResponsible,
} from '../../api/src/schedules/schedule.entity.js';
import { Unit } from '../../api/src/organization/unit.entity.js';
import { Sector } from '../../api/src/organization/sector.entity.js';
import { User } from '../../api/src/identity/user.entity.js';
import { FormTemplate } from '../../api/src/forms/entities/form-template.entity.js';
import { FormVersion } from '../../api/src/forms/entities/form-version.entity.js';
import { definition, question } from '../../api/test/helpers/form-fixtures.js';
import { materializationKey, occurrence } from '@portal/scheduling';
import { processSchedulingJob } from '../src/jobs/materialize-schedules.processor.js';
it('replays real Redis jobs without duplicating the PostgreSQL occurrence', async () => {
  const database = await createTestDatabase();
  const queueName = `portal-schedule-test-${randomUUID()}`;
  const connection = new Redis(process.env.REDIS_URL!, { maxRetriesPerRequest: null });
  const eventsConnection = connection.duplicate();
  const queue = new Queue(queueName, { connection });
  const events = new QueueEvents(queueName, { connection: eventsConnection });
  let worker: Worker | undefined;
  let runtime: Awaited<ReturnType<typeof createSchedulingRuntime>> | undefined;
  try {
    const em = database.orm.em.fork();
    const user = new User();
    Object.assign(user, {
      name: 'Responsável de teste',
      email: `${randomUUID()}@example.test`,
      passwordHash: 'unused-test-no-login',
      role: 'ADMIN',
      mustChangePassword: false,
    });
    const unit = new Unit();
    unit.name = 'Unidade';
    unit.nameKey = 'unidade';
    const sector = new Sector();
    sector.name = 'Setor';
    sector.nameKey = 'setor';
    sector.unit = unit;
    const form = new FormTemplate();
    Object.assign(form, {
      name: 'Ficha',
      nameKey: 'ficha',
      state: 'PUBLISHED',
      latestVersion: 1,
      draftSnapshot: null,
    });
    const version = new FormVersion();
    Object.assign(version, {
      template: form,
      number: 1,
      publishedBy: user,
      snapshot: definition([question('TEXT')]),
      contentHash: 'a'.repeat(64),
    });
    const at = new Date(
      occurrence({ time: '12:00' }, new Date(Date.now() + 86400000).toISOString().slice(0, 10)),
    );
    const schedule = new InspectionSchedule();
    Object.assign(schedule, {
      name: 'Redis real',
      unit,
      sector,
      form,
      createdBy: user,
      frequency: 'ONCE',
      startDate: at.toISOString().slice(0, 10),
      time: '12:00',
      deadlineHours: 24,
      nextOccurrenceAt: at,
    });
    const link = new ScheduleResponsible();
    link.schedule = schedule;
    link.user = user;
    em.persist([user, unit, sector, form, version, schedule, link]);
    await em.flush();
    runtime = await createSchedulingRuntime(database.orm.config.get('clientUrl')!);
    worker = new Worker(queueName, (job) => processSchedulingJob(job, runtime!, queue), {
      connection,
      concurrency: 2,
    });
    await events.waitUntilReady();
    const data = {
      scheduleId: schedule.id,
      occurrenceAt: at.toISOString(),
      idempotencyKey: materializationKey(schedule.id, at.toISOString()),
    };
    const first = await queue.add('materialize', data, { jobId: 'first' });
    const second = await queue.add('materialize', data, { jobId: 'replayed' });
    const results = await Promise.all([
      first.waitUntilFinished(events, 10000),
      second.waitUntilFinished(events, 10000),
    ]);
    expect(results[0].assignmentId).toBe(results[1].assignmentId);
    expect(await em.count(InspectionAssignment, { schedule: schedule.id })).toBe(1);
    // Replaying a retained completed job after pause/resume uses a new operational revision.
    await em.nativeUpdate(InspectionAssignment, { schedule: schedule.id }, { status: 'CANCELLED' });
    await em.nativeUpdate(InspectionSchedule, schedule.id, {
      isActive: true,
      revision: 3,
      nextOccurrenceAt: at,
    });
    await processSchedulingJob({ name: 'scan', data: {} }, runtime, queue);
    await vi.waitFor(
      async () =>
        expect(
          (
            await em.findOneOrFail(
              InspectionAssignment,
              { schedule: schedule.id },
              { refresh: true },
            )
          ).status,
        ).toBe('PLANNED'),
      { timeout: 10000 },
    );
    expect(await em.count(InspectionAssignment, { schedule: schedule.id })).toBe(1);
    // A retained failed job is explicitly retried by the next scan after infrastructure recovery.
    await worker.close();
    let fail = true;
    worker = new Worker(
      queueName,
      async (job) => {
        if (fail) throw new Error('temporary infrastructure failure');
        return processSchedulingJob(job, runtime!, queue);
      },
      { connection },
    );
    await em.nativeUpdate(InspectionAssignment, { schedule: schedule.id }, { status: 'CANCELLED' });
    await em.nativeUpdate(InspectionSchedule, schedule.id, { revision: 4, nextOccurrenceAt: at });
    const key = materializationKey(schedule.id, at.toISOString());
    const failed = await queue.add('materialize', data, { jobId: `${key}-r4`, attempts: 1 });
    await expect(failed.waitUntilFinished(events, 10000)).rejects.toThrow();
    fail = false;
    await processSchedulingJob({ name: 'scan', data: {} }, runtime, queue);
    await vi.waitFor(async () => expect(await failed.getState()).toBe('completed'), {
      timeout: 10000,
    });
    expect(
      (await em.findOneOrFail(InspectionAssignment, { schedule: schedule.id }, { refresh: true }))
        .status,
    ).toBe('PLANNED');
    expect(await em.count(InspectionAssignment, { schedule: schedule.id })).toBe(1);
  } finally {
    await worker?.close();
    await events.close();
    if (/^portal-schedule-test-[a-f0-9-]+$/.test(queueName))
      await queue.obliterate({ force: true });
    await queue.close();
    eventsConnection.disconnect();
    connection.disconnect();
    await runtime?.close();
    await database.close();
  }
}, 30000);
