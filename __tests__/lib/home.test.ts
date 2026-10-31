import { greeting, waited, when } from '@/lib/home';

// Thursday 30 October 2026, 15:00 local time.
const now = new Date(2026, 9, 30, 15, 0);
const at = (day: number, hour = 9) =>
  new Date(2026, 9, day, hour).toISOString();

describe('greeting', () => {
  it('follows the time of day', () => {
    expect(greeting(new Date(2026, 9, 30, 8))).toBe('Good morning');
    expect(greeting(now)).toBe('Good afternoon');
    expect(greeting(new Date(2026, 9, 30, 19))).toBe('Good evening');
  });
});

describe('waited', () => {
  it('counts calendar days', () => {
    expect(waited(at(30, 1), now)).toBe('today');
    expect(waited(at(29, 23), now)).toBe('1 day');
    expect(waited(at(24), now)).toBe('6 days');
    expect(waited(null, now)).toBe('—');
  });
});

describe('when', () => {
  it('says near dates the way people do', () => {
    expect(when(at(30, 20), now)).toBe('today');
    expect(when(at(31), now)).toBe('tomorrow');
    expect(when(at(29), now)).toBe('yesterday');
    expect(when(new Date(2026, 10, 2).toISOString(), now)).toBe('Mon');
    expect(when(new Date(2026, 10, 7).toISOString(), now)).toBe('7 Nov');
    expect(when(null, now)).toBeNull();
  });
});
