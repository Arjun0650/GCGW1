// Gallery manifest for /gallery/<state>/.
// photos/videos are file counts. videoInfo holds [durationSeconds, width, height]
// read from each MP4 in video-number order; every video also has a real
// poster frame at <state>-video-NN-poster.jpg.
window.GCGW_GALLERY_MEDIA = {
  "andhra-pradesh": { cover: 'gallery/andhra-pradesh/andhra-pradesh-photo-01-thumb.webp', photos: 17, videos: 8,
    videoInfo: [[23.13,478,850], [26.43,478,850], [17.93,478,850], [29.88,848,478], [17.43,478,850], [50.5,478,850], [12.63,478,850], [21.83,478,850]] },
  "karnataka": { cover: 'gallery/karnataka/karnataka-photo-01-thumb.webp', photos: 1, videos: 11,
    videoInfo: [[21.23,478,850], [10.9,478,850], [23.63,478,850], [17.09,478,850], [12.01,478,850], [44.38,478,850], [36.14,478,850], [12.1,464,832], [5.87,464,832], [52.51,464,832], [9.94,816,464]] },
  "mumbai": { cover: 'gallery/mumbai/mumbai-photo-01-thumb.webp', photos: 3, videos: 2,
    videoInfo: [[12.03,480,864], [14.21,480,864]] },
  "navi-mumbai": { cover: 'gallery/navi-mumbai/navi-mumbai-photo-01-thumb.webp', photos: 3, videos: 1,
    videoInfo: [[51.13,478,850]] },
  "odisha": { cover: 'gallery/odisha/odisha-photo-01-thumb.webp', photos: 3, videos: 8,
    videoInfo: [[90.15,478,850], [16.78,848,478], [18.8,848,478], [64.92,848,478], [27.51,480,864], [38.48,478,850], [22.91,816,464], [30.16,816,464]] },
  "pune": { cover: 'gallery/pune/pune-photo-01-thumb.webp', photos: 7, videos: 2,
    videoInfo: [[2.56,464,832], [26.71,464,832]] },
  "telangana": { cover: 'gallery/telangana/telangana-photo-01-thumb.webp', photos: 4, videos: 1,
    videoInfo: [[50.82,478,850]] },
};
