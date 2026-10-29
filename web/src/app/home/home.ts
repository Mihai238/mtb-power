import { ChangeDetectionStrategy, Component, output } from '@angular/core';

/** The page the app opens on: what it does, with a file picker and the demo ride. */
@Component({
  selector: 'app-home',
  templateUrl: './home.html',
  styleUrl: './home.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Home {
  readonly openFile = output<File>();
  readonly openDemo = output<void>();

  protected onFileInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (file) this.openFile.emit(file);
    // Let the same file be picked again after it was edited on disk.
    input.value = '';
  }
}
