// tsx asks for a numeric euid only to derive its temporary cache directory.
// Windows has no geteuid; defining it also avoids a Node/os.userInfo failure seen on some hosts.
if (process.platform === 'win32' && typeof process.geteuid !== 'function') {
  Object.defineProperty(process, 'geteuid', { value: () => 0 });
}
