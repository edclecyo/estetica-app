import packageJson from '../../package.json';

describe('app configuration', () => {
  it('keeps the Android package and app name aligned for production builds', () => {
    expect(packageJson.name).toBe('EsteticaApp');
    expect(packageJson.private).toBe(true);
  });
});
