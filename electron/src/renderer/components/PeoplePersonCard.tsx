import { useEffect, useState } from 'react';
import type { Person } from 'shared';
import { buildFaceThumbUrl } from './faceThumb';
import { PersonIcon } from './icons';
import { toast } from '../stores/toastStore';

interface PeoplePersonCardProps {
  person: Person;
  isSelected: boolean;
  onClick: () => void;
  onMergeTarget?: () => void;
  merging: boolean;
}

export function PeoplePersonCard({
  person,
  isSelected,
  onClick,
  onMergeTarget,
  merging,
}: PeoplePersonCardProps) {
  const [thumbUrl, setThumbUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!person.thumbnail_face_id) return;
    let cancelled = false;
    window.sortieAPI
      .getPersonImages(person.id, 1)
      .then(async (images) => {
        if (cancelled || images.length === 0) return;
        const faces = await window.sortieAPI.getImageFaces(images[0].id);
        const personFace = faces.find((face) => face.person_id === person.id);
        if (!cancelled && personFace) setThumbUrl(buildFaceThumbUrl(personFace));
      })
      .catch((error: Error | string) => {
        if (cancelled) return;
        const message = error instanceof Error ? error.message : String(error);
        toast.error(`Failed to load face thumbnail: ${message}`);
      });
    return () => {
      cancelled = true;
    };
  }, [person.id, person.thumbnail_face_id]);

  return (
    <button
      onClick={merging ? onMergeTarget : onClick}
      className={`flex flex-col items-center p-4 rounded-xl transition-all ${
        isSelected
          ? 'bg-lavender/30 ring-2 ring-ink/40'
          : merging
            ? 'bg-lavender/30 ring-2 ring-ink/20 hover:bg-lavender/50 cursor-crosshair'
            : 'bg-white hover:bg-gray-50 hover:shadow-md'
      } border border-gray-200`}
    >
      <div className="w-20 h-20 rounded-full bg-gray-200 overflow-hidden mb-3 flex-shrink-0">
        {thumbUrl ? (
          <img src={thumbUrl} alt={person.name || 'Unknown'} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-gray-400">
            <PersonIcon className="w-10 h-10" />
          </div>
        )}
      </div>
      <span className="text-sm font-medium text-gray-800 truncate max-w-full">
        {person.name || `Person ${person.id}`}
      </span>
      <span className="text-xs text-gray-400 mt-0.5">
        {person.face_count} {person.face_count === 1 ? 'photo' : 'photos'}
      </span>
    </button>
  );
}
