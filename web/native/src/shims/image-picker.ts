type PickerOptions = {
  mediaType?: 'photo' | 'video' | 'mixed';
  quality?: number;
};

function pickFile(options: PickerOptions = {}, capture?: string) {
  return new Promise<any>(resolve => {
    if (typeof document === 'undefined') {
      resolve({ didCancel: true, assets: [] });
      return;
    }

    const input = document.createElement('input');
    input.type = 'file';
    input.accept = options.mediaType === 'video' ? 'video/*' : 'image/*';
    if (capture) input.setAttribute('capture', capture);
    input.style.position = 'fixed';
    input.style.left = '-9999px';
    input.style.opacity = '0';

    input.onchange = () => {
      const file = input.files?.[0];
      document.body.removeChild(input);

      if (!file) {
        resolve({ didCancel: true, assets: [] });
        return;
      }

      const uri = URL.createObjectURL(file);
      resolve({
        didCancel: false,
        assets: [
          {
            uri,
            fileName: file.name,
            fileSize: file.size,
            type: file.type,
            width: 0,
            height: 0,
            file,
          },
        ],
      });
    };

    input.oncancel = () => {
      document.body.removeChild(input);
      resolve({ didCancel: true, assets: [] });
    };

    document.body.appendChild(input);
    input.click();
  });
}

export async function launchImageLibrary(options?: PickerOptions) {
  return pickFile(options);
}

export async function launchCamera(options?: PickerOptions) {
  return pickFile(options, 'environment');
}
