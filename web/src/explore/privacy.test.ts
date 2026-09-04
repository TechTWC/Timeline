import { describe, expect, it } from 'vitest';
import { ExploreConsentError, ExploreExternalAccessGate } from './privacy';

describe('ExploreExternalAccessGate', () => {
  it('blocks map/provider access before an explicit user action', () => {
    const gate = new ExploreExternalAccessGate();
    expect(gate.canAccessExternalServices()).toBe(false);
    expect(() => gate.requireConsent()).toThrow(ExploreConsentError);
  });

  it('allows external access only after consent and revokes it when unchecked', () => {
    const gate = new ExploreExternalAccessGate();
    gate.setConsent(true);
    expect(gate.canAccessExternalServices()).toBe(true);
    expect(() => gate.requireConsent()).not.toThrow();
    gate.setConsent(false);
    expect(gate.canAccessExternalServices()).toBe(false);
    expect(() => gate.requireConsent()).toThrow(ExploreConsentError);
  });
});
