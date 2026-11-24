import { describe, expect, it, vi } from 'vitest'
import { checkForUpdates, compareVersions } from '../version'

const npmView = vi.hoisted(() => vi.fn())
vi.mock('../../../package.json', () => ({ version: '3.7.2-ros2.0' }))
vi.mock('node:child_process', () => ({
  exec: Object.assign(vi.fn(), { [Symbol.for('nodejs.util.promisify.custom')]: npmView }),
}))

describe('compareVersions', () => {
  // Basic comparisons
  it('returns 0 for identical versions', () => {
    expect(compareVersions('1.0.0', '1.0.0')).toBe(0)
  })

  it('returns 1 when v1 > v2 (major)', () => {
    expect(compareVersions('2.0.0', '1.0.0')).toBe(1)
  })

  it('returns -1 when v1 < v2 (major)', () => {
    expect(compareVersions('1.0.0', '2.0.0')).toBe(-1)
  })

  it('returns 1 when v1 > v2 (minor)', () => {
    expect(compareVersions('1.8.0', '1.7.0')).toBe(1)
  })

  it('returns -1 when v1 < v2 (minor)', () => {
    expect(compareVersions('1.7.0', '1.8.0')).toBe(-1)
  })

  it('returns 1 when v1 > v2 (patch)', () => {
    expect(compareVersions('1.7.67', '1.7.66')).toBe(1)
  })

  it('returns -1 when v1 < v2 (patch)', () => {
    expect(compareVersions('1.7.66', '1.7.67')).toBe(-1)
  })

  // Real-world CCG version scenarios
  it('handles the update bug scenario: 1.7.67 vs 1.7.61', () => {
    expect(compareVersions('1.7.67', '1.7.61')).toBe(1)
  })

  it('same version returns 0: 1.7.67 vs 1.7.67', () => {
    expect(compareVersions('1.7.67', '1.7.67')).toBe(0)
  })

  // Edge cases
  it('handles versions with different segment counts', () => {
    expect(compareVersions('1.7', '1.7.0')).toBe(0)
  })

  it('treats missing segments as 0', () => {
    expect(compareVersions('1.7', '1.7.1')).toBe(-1)
  })

  it('handles single-segment versions', () => {
    expect(compareVersions('2', '1')).toBe(1)
  })

  it('handles 0.0.0 vs actual version', () => {
    expect(compareVersions('0.0.0', '1.7.67')).toBe(-1)
  })

  it('handles large patch numbers', () => {
    expect(compareVersions('1.7.100', '1.7.99')).toBe(1)
  })

  it.each([
    ['3.7.6-ros2.1', '3.7.6-ros2.0'],
    ['3.7.6-ros2.0', '3.7.2-ros2.0'],
    ['3.8.0-ros2.0', '3.7.6-ros2.1'],
    ['3.7.10-ros2.0', '3.7.9-ros2.0'],
    ['3.7.6-ros2.10', '3.7.6-ros2.9'],
    ['3.7.6-ros2.0', '3.7.2-ros2.9'],
    ['3.7.6', '3.7.6-ros2.0'],
    ['1.0.0-rc', '1.0.0-99'],
    ['1.0.0-alpha', '1.0.0-Beta'],
    ['1.0.0-alpha.0', '1.0.0-alpha'],
    ['1.0.0-9007199254740993', '1.0.0-9007199254740992'],
  ])('ranks %s above %s', (higher, lower) => {
    expect(compareVersions(higher, lower)).toBe(1)
    expect(compareVersions(lower, higher)).toBe(-1)
  })

  it('ignores v and build metadata, including after a prerelease', () => {
    expect(compareVersions('v3.7.6-ros2.10+sha.123', '3.7.6-ros2.10+001')).toBe(0)
    expect(compareVersions('v3.7.6+1', '3.7.6')).toBe(0)
  })

  it.each(['latest', '1.02.3', '1.2.3-01', '1.2.3-rc..1', '1.2.3+', '1.2.3.4'])('does not order malformed version %s', (invalid) => {
    expect(compareVersions(invalid, '2.0.0')).toBe(0)
    expect(compareVersions('2.0.0', invalid)).toBe(0)
  })
})

describe('checkForUpdates', () => {
  it.each(['3.7.6-ros2.1', '3.7.6-ros2.0'])('detects %s from an installed 3.7.2-ros2.0', async (latestVersion) => {
    npmView.mockResolvedValueOnce({ stdout: latestVersion + '\n' })
    expect(await checkForUpdates()).toEqual({ hasUpdate: true, currentVersion: '3.7.2-ros2.0', latestVersion })
    expect(npmView).toHaveBeenCalledWith('npm view ccg-ros2-workflow version')
  })
})
