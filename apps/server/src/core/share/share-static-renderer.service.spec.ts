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
        {
          type: 'codeBlock',
          attrs: { language: 'mermaid' },
          content: [{ type: 'text', text: 'graph TD\nA-->B' }],
        },
        {
          type: 'codeBlock',
          attrs: { language: 'typescript' },
          content: [{ type: 'text', text: 'const x = 1;' }],
        },
      ],
    });

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

  it('marks interactive blocks and unsupported blocks during post process', () => {
    const payload = (service as any).postProcess(
      [
        '<div data-type="embed" data-src="javascript:alert(1)">',
        '<a href="javascript:alert(1)" target="blank">bad</a>',
        '</div>',
        '<div data-type="subpages"></div>',
      ].join(''),
      'hash',
    );

    expect(payload.interactiveBlocks).toEqual([
      { id: 'share-block-1', type: 'embed' },
    ]);
    expect(payload.legacyFallbackReason).toBe('contains_unsupported_blocks');
    expect(payload.html).not.toContain('javascript:');
    expect(payload.html).toContain('rel="noopener noreferrer"');
  });
});
