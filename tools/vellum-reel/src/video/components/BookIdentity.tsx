import {interpolate, useCurrentFrame} from 'remotion';
import type {BookProject} from '../../schema';

export const BookIdentity: React.FC<{project: BookProject}> = ({project}) => {
  const frame = useCurrentFrame();
  const intro = interpolate(frame, [0, 24], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <div style={{opacity: intro}}>
      <div className="book-cover" style={{borderColor: project.style.accent}}>
        <div className="book-cover-edition">VELLUM / 001</div>
        <div className="book-cover-small">{project.book.coverTop ?? project.book.englishTitle.toUpperCase()}</div>
        <div className="book-cover-rule" />
        <div className="book-cover-title">{project.book.title.replace(/[《》]/g, '')}</div>
        <div className="book-cover-author">{project.book.coverAuthor ?? project.book.author}</div>
      </div>

      <header className="title-block">
        <div className="title-eyebrow">A BOOK IN MOTION</div>
        <h1>{project.book.title}</h1>
        <p>{project.book.author}</p>
      </header>

      <footer className="brand-block">
        <div className="english-title" style={{color: project.style.accent}}>
          <span className="english-rule" style={{backgroundColor: project.style.accent}} />
          {project.book.englishTitle}
          <span className="english-rule english-rule-right" style={{backgroundColor: project.style.accent}} />
        </div>
        <div className="strapline">{project.book.strapline}</div>
      </footer>

      <div className="corner-mark">{project.book.cornerMark}</div>
    </div>
  );
};
