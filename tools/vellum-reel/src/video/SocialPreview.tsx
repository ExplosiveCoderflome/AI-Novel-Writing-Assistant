import React from 'react';
import {AbsoluteFill, Img, staticFile} from 'remotion';

const copy = {
  zh: {
    edition: '开源项目 · v0.3.0',
    tagline: '文字驱动的叙事视频生产线',
    headline: <>把书籍与长篇故事，<br />变成电影感竖屏视频。</>,
    steps: ['文本', '旁白', '字幕', '分镜', '渲染', '验片'],
    features: ['书籍解读', '长篇叙事', '中文字幕', '自动质检'],
  },
  en: {
    edition: 'OPEN SOURCE · v0.3.0',
    tagline: 'NARRATIVE VIDEO, SHAPED BY TEXT.',
    headline: <>Turn books and long-form stories into<br />cinematic vertical video — reproducibly.</>,
    steps: ['TEXT', 'VOICE', 'CAPTIONS', 'SHOTS', 'RENDER', 'QC'],
    features: ['BOOK NOTES', 'LONG-FORM NARRATIVE', 'CHINESE CAPTIONS', 'AUTO QC'],
  },
} as const;

export const SocialPreview: React.FC<{locale?: keyof typeof copy}> = ({locale = 'zh'}) => {
  const content = copy[locale];
  const isZh = locale === 'zh';
  return (
    <AbsoluteFill
      style={{
        backgroundColor: '#080a0b',
        color: '#f6f1e6',
        fontFamily: 'Inter, SF Pro Display, PingFang SC, sans-serif',
        overflow: 'hidden',
      }}
    >
      <Img
        src={staticFile('assets/brand/vellum-reel-backdrop.jpg')}
        style={{position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover'}}
      />
      <AbsoluteFill
        style={{
          background: 'linear-gradient(90deg, rgba(5,7,8,.98) 0%, rgba(5,7,8,.94) 43%, rgba(5,7,8,.35) 69%, rgba(5,7,8,.08) 100%)',
        }}
      />

      <div style={{position: 'absolute', inset: 28, border: '1px solid rgba(211,174,93,.24)'}} />
      <div style={{position: 'absolute', top: 28, left: 28, width: 155, height: 3, background: '#d3ae5d'}} />

      <div style={{position: 'absolute', left: 68, top: 55, width: 735}}>
        <div style={{display: 'flex', alignItems: 'center', gap: 17}}>
          <div
            style={{
              width: 48,
              height: 48,
              display: 'grid',
              placeItems: 'center',
              border: '1px solid #d3ae5d',
              transform: 'rotate(45deg)',
              color: '#d3ae5d',
              font: '700 15px Georgia, serif',
            }}
          >
            <span style={{transform: 'rotate(-45deg)'}}>VR</span>
          </div>
          <div>
            <div style={{fontSize: 13, lineHeight: 1, fontWeight: 700, letterSpacing: isZh ? 3 : 5, color: '#d3ae5d'}}>{content.edition}</div>
            <div style={{marginTop: 7, fontSize: 13, letterSpacing: isZh ? 3 : 2.5, color: 'rgba(246,241,230,.52)'}}>{content.tagline}</div>
          </div>
        </div>

        <h1 style={{margin: '44px 0 0', font: '700 76px/.95 Georgia, serif', letterSpacing: -2}}>VellumReel</h1>
        <div style={{marginTop: 6, color: '#d3ae5d', font: '600 28px/1.2 Songti SC, STSong, serif', letterSpacing: 8}}>卷影</div>

        <p style={{margin: '24px 0 0', maxWidth: 620, fontSize: isZh ? 30 : 26, lineHeight: 1.35, fontWeight: 620, letterSpacing: isZh ? 1 : -.3}}>
          {content.headline}
        </p>

        <div style={{display: 'flex', alignItems: 'center', gap: 9, marginTop: 35}}>
          {content.steps.map((step, index) => (
            <React.Fragment key={step}>
              <div
                style={{
                  padding: '9px 12px 8px',
                  border: '1px solid rgba(211,174,93,.36)',
                  background: 'rgba(7,9,10,.58)',
                  color: index === 0 || index === content.steps.length - 1 ? '#e5c779' : 'rgba(246,241,230,.72)',
                  fontSize: isZh ? 12 : 10,
                  fontWeight: 750,
                  letterSpacing: isZh ? 2 : 1.2,
                }}
              >
                {step}
              </div>
              {index < content.steps.length - 1 ? <span style={{color: 'rgba(211,174,93,.58)', fontSize: 15}}>›</span> : null}
            </React.Fragment>
          ))}
        </div>
      </div>

      <div style={{position: 'absolute', left: 68, right: 68, bottom: 48, display: 'flex', alignItems: 'center', gap: 13}}>
        {content.features.map((item) => (
          <span key={item} style={{fontSize: isZh ? 11 : 10, fontWeight: 700, letterSpacing: isZh ? 2 : 1.5, color: 'rgba(246,241,230,.58)'}}>◆ {item}</span>
        ))}
        <span style={{marginLeft: 'auto', color: 'rgba(246,241,230,.72)', font: '600 13px/1 ui-monospace, SFMono-Regular, monospace'}}>github.com/SilentFleetKK/vellum-reel</span>
      </div>
    </AbsoluteFill>
  );
};

export const SocialPreviewEn: React.FC = () => <SocialPreview locale="en" />;
