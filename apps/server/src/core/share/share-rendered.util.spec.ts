import { canUseStaticShareRender } from './share-rendered.util';

describe('canUseStaticShareRender', () => {
  it('returns true when rendered html exists without fallback reason', () => {
    expect(
      canUseStaticShareRender({
        html: '<p>hello</p>',
        legacyFallbackReason: null,
      }),
    ).toBe(true);
  });

  it('returns true when only segmented head html exists without fallback reason', () => {
    expect(
      canUseStaticShareRender({
        headHtml: '<p>hello</p>',
      }),
    ).toBe(true);
  });

  it('returns false when renderer requests legacy fallback', () => {
    expect(
      canUseStaticShareRender({
        html: '<div data-type="subpages"></div>',
        legacyFallbackReason: 'contains_unsupported_blocks',
      }),
    ).toBe(false);
  });

  it('returns false when no rendered html exists', () => {
    expect(
      canUseStaticShareRender({
        html: '',
        headHtml: null,
      }),
    ).toBe(false);
  });
});
