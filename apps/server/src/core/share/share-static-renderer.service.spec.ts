jest.mock('../../common/helpers/prosemirror/utils', () => ({
  getProsemirrorContent: jest.fn((content) => content),
}));

jest.mock('../../collaboration/collaboration.util', () => ({
  jsonToHtml: jest.fn(),
}));

import { jsonToHtml } from '../../collaboration/collaboration.util';
import { ShareStaticRendererService } from './share-static-renderer.service';

describe('ShareStaticRendererService', () => {
  let service: ShareStaticRendererService;
  const mockedJsonToHtml = jest.mocked(jsonToHtml);

  beforeEach(() => {
    service = new ShareStaticRendererService();
    mockedJsonToHtml.mockReset();
  });

  it('wraps code blocks with share reader markup and labels mermaid source', () => {
    mockedJsonToHtml.mockReturnValue(
      [
        '<p>hello</p>',
        '<pre><code class="language-mermaid">graph TD\nA--&gt;B</code></pre>',
        '<pre><code class="language-typescript">const x = 1;</code></pre>',
      ].join(''),
    );

    const payload = service.render({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'hello' }],
        },
      ],
    });

    expect(payload.deliveryMode).toBe('full');
    expect(payload.html).toContain(
      '<section class="share-code-block" data-language="mermaid">',
    );
    expect(payload.html).toContain('Mermaid source');
    expect(payload.html).toContain(
      '<section class="share-code-block" data-language="typescript">',
    );
    expect(payload.html).toContain('const x = 1;');
    expect(mockedJsonToHtml).toHaveBeenCalledTimes(1);
  });

  it('marks interactive blocks and strips dangerous URLs during post process', () => {
    mockedJsonToHtml.mockReturnValue(
      [
        '<div data-type="embed" data-src="javascript:alert(1)">',
        '<a href="javascript:alert(1)" target="blank">bad</a>',
        '</div>',
        '<div data-type="subpages"></div>',
      ].join(''),
    );

    const payload = service.render({
      type: 'doc',
      content: [],
    });

    expect(payload.interactiveBlocks).toEqual([
      { id: 'share-block-1', type: 'embed' },
    ]);
    expect(payload.legacyFallbackReason).toBe('contains_unsupported_blocks');
    expect(payload.html).not.toContain('javascript:');
    expect(payload.html).toContain('rel="noopener noreferrer"');
  });

  it('segments long documents and returns subsequent chunks by cursor', () => {
    mockedJsonToHtml.mockReturnValue(
      Array.from({ length: 72 }, (_, index) =>
        index === 0
          ? `<h1>Intro</h1>`
          : index === 30
            ? `<h2>Deep Dive</h2>`
            : `<p>Paragraph ${index}</p>`,
      ).join(''),
    );

    const content = {
      type: 'doc',
      content: [],
    };
    const payload = service.render(content);

    expect(payload.deliveryMode).toBe('segmented');
    expect(payload.html).toBeNull();
    expect(payload.headHtml).toContain('<h1 id="intro">Intro</h1>');
    expect(payload.nextCursor).toBe('seg:1');
    expect(payload.segmentCount).toBeGreaterThan(1);
    expect(payload.toc).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'intro', segmentIndex: 0 }),
        expect.objectContaining({ id: 'deep-dive', segmentIndex: 1 }),
      ]),
    );

    const nextSegment = service.getSegment(content, 'seg:1');

    expect(nextSegment).toEqual(
      expect.objectContaining({
        segmentIndex: 1,
      }),
    );
    expect(nextSegment?.html).toContain('Deep Dive');
  });
});
