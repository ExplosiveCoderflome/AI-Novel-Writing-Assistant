declare module 'react-masonry-css' {
  import { ComponentType, HTMLAttributes } from 'react';

  export interface MasonryProps extends HTMLAttributes<HTMLDivElement> {
    breakpointCols?: number | { [key: number]: number };
    className?: string;
    columnClassName?: string;
  }

  const Masonry: ComponentType<MasonryProps>;
  export default Masonry;
} 