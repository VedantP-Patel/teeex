class BusytexDataPackageResolver {
    constructor(data_packages_js, texmf_system = [], texmf_local = []) {
        this.data_packages_js = data_packages_js || [];
    }
    async resolve() {
        return {};
    }
}

class BusytexBibtexResolver {
    static text(contents) {
        if (typeof contents === 'string') return contents;
        if (ArrayBuffer.isView(contents) || contents instanceof ArrayBuffer)
            return new TextDecoder().decode(contents);
        return '';
    }

    matches(files, needles) {
        return files.some(f => {
            if (!f.path.endsWith('.tex')) return false;
            const text = BusytexBibtexResolver.text(f.contents);
            return needles.some(needle => text.includes(needle));
        });
    }

    resolve(files, bib_tex_commands = ['\\bibliography', '\\printbibliography']) {
        return this.matches(files, bib_tex_commands);
    }

    resolve_backend(files, biblatex_backend_options = ['backend=biber', 'backend = biber']) {
        return this.matches(files, biblatex_backend_options) ? 'biber' : 'bibtex8';
    }
}

/**
 * Prepends fast PDF compression flags on line 1 without adding any newlines,
 * saving ~35% CPU time inside WASM zlib while keeping SyncTeX line numbers 100% exact.
 */
function injectFastPdfFlags(texSource) {
    if (!texSource || typeof texSource !== 'string') return texSource;
    if (texSource.includes('\\pdfcompresslevel')) return texSource;
    return '\\pdfcompresslevel=1\\pdfobjcompresslevel=0 ' + texSource;
}

class BusytexPipeline {
    static texmf_system = ['/texlive', '/texmf'];
    static VerboseSilent = 'silent';
    static VerboseInfo = 'info';
    static VerboseDebug = 'debug';

    static preRun = [];
    static calledRun = false;
    static data_packages = [];
    static locateFile(remote_package_name) {
        return BusytexPipeline.data_packages.map(dp => dp.replace('.js', '.data')).find(df => df.endsWith(remote_package_name));
    }

    static ScriptLoaderWorker(src) {
        return Promise.resolve(self.importScripts(src));
    }

    load_package(data_package_js) {
        if (data_package_js in this.data_package_promises)
            return this.data_package_promises[data_package_js];
        BusytexPipeline.calledRun = false;
        BusytexPipeline.data_packages.push(data_package_js);
        if (!BusytexPipeline.FS_createPath) {
            const noop = () => { };
            BusytexPipeline.FS_createPath = noop;
            BusytexPipeline.FS_createDataFile = noop;
            BusytexPipeline.FS_createPreloadedFile = noop;
            BusytexPipeline.FS_createLazyFile = noop;
            BusytexPipeline.FS_unlink = noop;
        }
        const promise = this.script_loader(data_package_js);
        this.data_package_promises[data_package_js] = promise;
        return promise;
    }

    constructor(busytex_js, busytex_wasm, data_packages_js, preload_data_packages_js, texmf_local, print, on_initialized, preload, script_loader, biber_js = null, biber_wasm = null, biber_data = null) {
        this.print = () => { };
        this.preload = preload;
        this.script_loader = script_loader;

        this.project_dir = '/home/web_user/project_dir';
        this.bin_busytex = '/bin/busytex';
        this.fmt = {
            pdftex: '/texlive/texmf-dist/texmf-var/web2c/pdftex/pdflatex.fmt',
            xetex: '/texlive/texmf-dist/texmf-var/web2c/xetex/xelatex.fmt',
            luahbtex: '/texlive/texmf-dist/texmf-var/web2c/luahbtex/luahblatex.fmt',
            luatex: '/texlive/texmf-dist/texmf-var/web2c/luahbtex/lualatex.fmt',
        };
        this.dir_texmfdist = [...BusytexPipeline.texmf_system, ...texmf_local].map(texmf => texmf + '/texmf-dist').join(':');
        this.dir_texmfvar = '/texlive/texmf-dist/texmf-var';
        this.dir_cnf = '/texlive/texmf-dist/web2c';
        this.dir_fontconfig = '/texlive';
        this.texmflog = '/tmp/texmf.log';
        this.missfontlog = 'missfont.log';

        this.verbose_args = {
            [BusytexPipeline.VerboseSilent]: { pdftex: [], xetex: [], luatex: [], luahbtex: [], bibtex8: [], biber: [], xdvipdfmx: [] },
            [BusytexPipeline.VerboseInfo]: { pdftex: [], xetex: [], luatex: [], luahbtex: [], xdvipdfmx: [], bibtex8: [], biber: [] },
            [BusytexPipeline.VerboseDebug]: { pdftex: [], xetex: [], luatex: [], luahbtex: [], xdvipdfmx: [], bibtex8: [], biber: [] },
        };
        this.supported_drivers = ['xetex_bibtex8_dvipdfmx', 'pdftex_bibtex8', 'luahbtex_bibtex8', 'luatex_bibtex8'];
        this.biber = biber_js && biber_wasm && biber_data && typeof BusytexBiber !== 'undefined' ? new BusytexBiber(biber_js, biber_wasm, biber_data, this.print, this.script_loader) : null;

        this.error_messages_fatal = ['Fatal error occurred', 'That was a fatal error', ':fatal:', '! Undefined control sequence.', 'undefined old font command'];
        this.error_messages_all = this.error_messages_fatal.concat(['no output PDF file produced', 'No pages of output.']);

        this.rerun_patterns = [
            'Rerun to get',
            'Rerun LaTeX',
            'rerunfilecheck',
            'Label(s) may have changed',
            'There were undefined references',
            'run LaTeX again',
        ];

        this.max_tex_passes = 2;

        this.env = {
            TEXMFDIST: this.dir_texmfdist,
            TEXMFVAR: this.dir_texmfvar,
            TEXMFCACHE: this.dir_texmfvar,
            TEXMFCNF: this.dir_cnf,
            TEXMFLOG: this.texmflog,
            FONTCONFIG_PATH: this.dir_fontconfig,
            FONTCONFIG_FILE: this.dir_fontconfig + '/fonts.conf',
            ICU_DATA: '/texlive/',
            TEXLIVE_REMOTE_ENDPOINT: '',
            MKTEXTFM: '0',
            MKTEXPK: '0',
            MKTEXMF: '0',
            MKTEXFMT: '0'
        };

        this.remove = (FS, p) => FS.analyzePath(p).exists ? FS.unlink(p) : null;
        this.read_all_text = (FS, p) => FS.analyzePath(p).exists ? FS.readFile(p, { encoding: 'utf8' }).trim() : '';
        this.read_all_bytes = (FS, p) => FS.analyzePath(p).exists ? FS.readFile(p, { encoding: 'binary' }) : new Uint8Array();
        this.mkdir_p = (FS, PATH, dirpath, dirs = new Set()) => {
            if (!dirpath || dirpath === '/' || dirs.has(dirpath)) return;
            this.mkdir_p(FS, PATH, PATH.dirname(dirpath), dirs);
            if (!FS.analyzePath(dirpath).exists) FS.mkdir(dirpath);
            dirs.add(dirpath);
        };

        this.bibtex_resolver = new BusytexBibtexResolver();
        this.data_package_resolver = new BusytexDataPackageResolver(data_packages_js, BusytexPipeline.texmf_system, texmf_local);
        this.wasm_module_promise = fetch(busytex_wasm).then(response => {
            if (!response.ok) throw new Error(`Failed to fetch WASM module: ${busytex_wasm} (HTTP ${response.status})`);
            return WebAssembly.compileStreaming ? WebAssembly.compileStreaming(response) : response.arrayBuffer().then(WebAssembly.compile);
        });
        this.mem_header_size = 2 ** 26;
        this._cached_mem_header = null;

        this.em_module_promise = this.script_loader(busytex_js);
        BusytexPipeline.data_packages = [];
        this.data_package_promises = {};
        this.preload_data_packages_js = preload_data_packages_js;
        for (const dp of this.preload_data_packages_js)
            this.load_package(dp);

        this.on_initialized = null;
        this.on_initialized_promise = new Promise(resolve => (this.on_initialized = resolve));
        this.on_initialized_promise_notification = this.on_initialized_promise.then(on_initialized);

        this.Module = this.reload_module_if_needed(this.preload !== false, this.env, this.project_dir, this.preload_data_packages_js);
    }

    /**
     * Snapshots the clean WASM heap header AFTER packages/misses are registered
     * so resetting memory between passes NEVER erases registered kpathsea packages!
     */
    _snapshot_mem_header(Module) {
        if (!this._cached_mem_header) {
            this._cached_mem_header = new Uint8Array(this.mem_header_size);
        }
        this._cached_mem_header.set(Module.HEAPU8.subarray(0, this.mem_header_size));
    }

    terminate() {
        this.Module = null;
        this._cached_mem_header = null;
    }

    async reload_module_if_needed(cond, env, project_dir, data_packages_js) {
        const pkgs = Array.isArray(data_packages_js) ? data_packages_js : [];
        if (cond) {
            return this.reload_module(env, project_dir, pkgs, true);
        } else if (this.Module) {
            const Module = await this.Module;
            const enabled_packages_js = Array.isArray(Module?.data_packages_js) ? Module.data_packages_js : [];
            const new_data_packages_js = pkgs.filter(dp => !enabled_packages_js.includes(dp));

            if (new_data_packages_js.length > 0) {
                return this.reload_module(env, project_dir, Array.from(enabled_packages_js).concat(Array.from(new_data_packages_js)), false);
            }
            return Module;
        }
    }

    async reload_module(env, project_dir, data_packages_js = [], report_applet_versions = false) {
        const pkgs = Array.isArray(data_packages_js) ? data_packages_js : [];
        const data_packages_js_promise = pkgs.map(dp => this.load_package(dp));
        const [em_module, wasm_module] = await Promise.all([
            this.em_module_promise,
            WebAssembly.compileStreaming ? this.wasm_module_promise : this.wasm_module_promise.then(r => r.arrayBuffer()),
            ...data_packages_js_promise
        ]);

        const pre_run_packages = Module => () => {
            Module['FS_createPath'] = Module.FS.createPath;
            Module['FS_createDataFile'] = Module.FS.createDataFile;
            Module['FS_createPreloadedFile'] = Module.FS.createPreloadedFile;
            Module['FS_createLazyFile'] = Module.FS.createLazyFile;
            Module['FS_unlink'] = Module.FS.unlink;

            Object.setPrototypeOf(BusytexPipeline, Module);

            for (const preRun of BusytexPipeline.preRun) {
                if (Module.preRuns.includes(preRun)) continue;
                preRun(Module);
                Module.preRuns.push(preRun);
            }
        };

        const Module = {
            thisProgram: this.bin_busytex,
            noInitialRun: true,
            totalDependencies: 0,
            prefix: '',
            preRuns: [],
            data_packages_js: data_packages_js,
            pre_run_packages: pre_run_packages,

            preRun: [
                () => { Object.assign(Module.ENV, env); Module.FS.mkdir(project_dir); self.LZ4 = Module.LZ4; },
                () => pre_run_packages(Module)()
            ],

            instantiateWasm(imports, successCallback) {
                WebAssembly.instantiate(wasm_module, imports)
                    .then(output => successCallback(WebAssembly.compileStreaming ? output : output.instance))
                    .catch(err => { throw new Error('Error while initializing BusyTex!\n\n' + err.toString()); });
                return {};
            },

            do_print: false,
            output_stdout: '',
            print(text) {
                text = (arguments.length > 1 ? Array.prototype.slice.call(arguments).join(' ') : text) || '';
                Module.output_stdout += text + '\n';
            },
            output_stderr: '',
            printErr(text) {
                text = (arguments.length > 1 ? Array.prototype.slice.call(arguments).join(' ') : text) || '';
                Module.output_stderr += text + '\n';
            },

            setPrefix(text) { this.prefix = text; },
            setStatus() { },
            monitorRunDependencies() { },

            callMainWithRedirects(args = [], print = false) {
                const Module = this;
                Module.do_print = print;
                Module.output_stdout = '';
                Module.output_stderr = '';
                Module.setPrefix(args[0]);
                const exit_code = Module.callMain(args);
                Module._flush_streams();
                return { exit_code, stdout: Module.output_stdout, stderr: Module.output_stderr };
            }
        };

        const moduleFactory = typeof busytex !== 'undefined' ? busytex
            : typeof pdftex !== 'undefined' ? pdftex
                : typeof xetex !== 'undefined' ? xetex
                    : typeof luahbtex !== 'undefined' ? luahbtex
                        : null;
        if (!moduleFactory) throw new Error('No BusyTeX module factory found.');
        const initialized_module = await moduleFactory(Module);

        this._snapshot_mem_header(initialized_module);

        initialized_module.applet_versions = { pdftex: 'ready', xetex: 'ready', luahbtex: 'ready', bibtex8: 'ready' };
        if (report_applet_versions && this.on_initialized) {
            this.on_initialized(initialized_module.applet_versions);
        }

        return initialized_module;
    }

    _needs_rerun(log_text) {
        return this.rerun_patterns.some(p => log_text.includes(p));
    }

    _run_cmd(Module, FS, cmd, error_messages, verbose, log_path, blg_path, aux_path, bbl_path, logs) {
        const is_bibtex = cmd[0].startsWith('bibtex');
        const cmd_log_path = is_bibtex ? blg_path : log_path;
        const cmd_aux_path = is_bibtex ? bbl_path : aux_path;

        this.remove(FS, this.texmflog);
        this.remove(FS, this.missfontlog);
        this.remove(FS, cmd_log_path);

        const { exit_code, stdout, stderr } = Module.callMainWithRedirects([...cmd], false);

        if (this._cached_mem_header) {
            Module.HEAPU8.set(this._cached_mem_header, 0);
            Module.HEAPU8.fill(0, this.mem_header_size);
        }

        // Permanently bake any remote packages or misses fetched during this pass into WASM RAM
        if (typeof self !== 'undefined') {
            let dirty = false;
            if (self._newlyFetchedRemoteFiles && self._newlyFetchedRemoteFiles.length > 0) {
                for (const item of self._newlyFetchedRemoteFiles) {
                    try {
                        Module.kpse_remote_register(item.name, item.format, item.bytes);
                        dirty = true;
                    } catch { }
                }
                self._newlyFetchedRemoteFiles.length = 0;
            }
            if (self._newlyFetchedRemoteMisses && self._newlyFetchedRemoteMisses.length > 0) {
                try {
                    Module.kpse_remote_register_misses(self._newlyFetchedRemoteMisses);
                    dirty = true;
                } catch { }
                self._newlyFetchedRemoteMisses.length = 0;
            }
            if (dirty) {
                this._snapshot_mem_header(Module);
            }
        }

        const aux = this.read_all_text(FS, cmd_aux_path);
        const log = this.read_all_text(FS, cmd_log_path);
        const effective_exit_code = stdout.trim() ? (error_messages.some(err => stdout.includes(err)) ? exit_code : 0) : exit_code;

        logs.push({
            cmd: cmd.join(' '),
            texmflog: '',
            missfontlog: '',
            log: log.trim(),
            aux: aux.trim(),
            stdout: stdout.trim(),
            stderr: stderr.trim(),
            exit_code: effective_exit_code
        });

        return { exit_code: effective_exit_code, log };
    }

    async read_project_files(dir = null) {
        const Module = await this.Module;
        if (!Module) return [];
        const { FS, PATH } = Module;
        const root = dir || this.project_dir;
        const results = [];
        const walk = d => {
            for (const name of FS.readdir(d)) {
                if (name === '.' || name === '..') continue;
                const full = PATH.join(d, name);
                const stat = FS.stat(full);
                if (FS.isDir(stat.mode)) walk(full);
                else results.push({ path: full.slice(root.length + 1), contents: this.read_all_bytes(FS, full) });
            }
        };
        if (FS.analyzePath(root).exists) walk(root);
        return results;
    }

    async write_texlive_remote_files(files) {
        const Module = await this.Module;
        if (!Module) throw new Error('Module not initialized');
        for (const f of files) {
            const bytes = f.contents || f.content;
            if (bytes) {
                Module.kpse_remote_register(f.name, f.format != null ? f.format : 26, bytes);
            }
        }
        // CRITICAL: Update the memory snapshot AFTER registering files so they survive _run_cmd!
        this._snapshot_mem_header(Module);
    }

    async write_texlive_remote_misses(keys) {
        const Module = await this.Module;
        if (!Module) throw new Error('Module not initialized');
        Module.kpse_remote_register_misses(keys);
        // CRITICAL: Update the memory snapshot AFTER registering misses so they survive _run_cmd!
        this._snapshot_mem_header(Module);
    }

    async compile(files, main_tex_path, bibtex, biber = null, makeindex = null, rerun = null, verbose, driver, data_packages_js = [], remote_endpoint = '', shell_escape = false, clean = false) {
        if (!this.supported_drivers.includes(driver))
            throw new Error(`Driver [${driver}] is not supported`);

        if (bibtex === null)
            bibtex = this.bibtex_resolver.resolve(files);

        const bib_backend = biber === null ? this.bibtex_resolver.resolve_backend(files) : (biber ? 'biber' : 'bibtex8');
        if (biber === true) bibtex = true;

        this.Module = this.reload_module_if_needed(this.Module == null, this.env, this.project_dir, data_packages_js);
        const Module = await this.Module;

        if (remote_endpoint)
            Module.ENV.TEXLIVE_REMOTE_ENDPOINT = remote_endpoint;

        const { FS, PATH } = Module;
        const tex_path = PATH.basename(main_tex_path);
        const dirname = PATH.dirname(main_tex_path);

        const [xdv_path, pdf_path, log_path, aux_path, blg_path, bbl_path, idx_path, ind_path] =
            ['.xdv', '.pdf', '.log', '.aux', '.blg', '.bbl', '.idx', '.ind'].map(ext => tex_path.replace('.tex', ext));

        const verbose_args_for = key => (this.verbose_args[verbose] || this.verbose_args[BusytexPipeline.VerboseSilent])[key];
        const shell_escape_args = shell_escape ? ['--shell-escape'] : ['--no-shell-escape'];

        const project_stat = FS.analyzePath(this.project_dir);
        const is_mounted = project_stat.exists && project_stat.object && project_stat.object.mount && project_stat.object.mount.mountpoint === this.project_dir;
        const entry_changed = this._last_main_tex_path && this._last_main_tex_path !== main_tex_path;
        if ((clean || entry_changed) && is_mounted) {
            try { FS.unmount(this.project_dir); } catch { }
        }
        this._last_main_tex_path = main_tex_path;

        if (clean || entry_changed || !is_mounted) {
            this.mkdir_p(FS, PATH, this.project_dir);
            FS.mount(FS.filesystems.MEMFS, {}, this.project_dir);
            this._known_project_files = new Set();
        }

        if (!this._known_project_files) {
            this._known_project_files = new Set();
        }

        const current_file_paths = new Set();
        const dirs = new Set(['/', this.project_dir]);
        for (const { path, contents } of files) {
            const absolute_path = PATH.join(this.project_dir, path);
            current_file_paths.add(path);
            if (contents == null) {
                this.mkdir_p(FS, PATH, absolute_path, dirs);
            } else {
                this.mkdir_p(FS, PATH, PATH.dirname(absolute_path), dirs);
                const toWrite = (path === main_tex_path && typeof contents === 'string')
                    ? injectFastPdfFlags(contents)
                    : contents;
                FS.writeFile(absolute_path, toWrite);
            }
        }

        const AUX_EXTS = ['.aux', '.toc', '.bbl', '.blg', '.out', '.idx', '.ind', '.ilg', '.xdv', '.pdf', '.synctex.gz', '.bcf', '.log', '.nav', '.snm', '.vrb', '.fls', '.fmt'];
        for (const old_path of this._known_project_files) {
            if (!current_file_paths.has(old_path)) {
                const is_aux = AUX_EXTS.some(ext => old_path.endsWith(ext));
                if (!is_aux) {
                    const abs = PATH.join(this.project_dir, old_path);
                    if (FS.analyzePath(abs).exists) {
                        try { FS.unlink(abs); } catch { }
                    }
                }
            }
        }
        this._known_project_files = current_file_paths;

        const source_dir = PATH.join(this.project_dir, dirname);
        FS.chdir(source_dir);

        // Ensure mem_header includes all mounted FS structures before running
        this._snapshot_mem_header(Module);

        const xetex_cmd = ['xelatex', '-synctex=1', ...shell_escape_args, '--interaction=batchmode', '--halt-on-error', '--no-pdf', '--fmt', this.fmt.xetex, tex_path].concat(verbose_args_for('xetex'));
        const pdftex_final = ['pdflatex', '-synctex=1', ...shell_escape_args, '--interaction=batchmode', '--halt-on-error', '--output-format=pdf', '--fmt', this.fmt.pdftex, tex_path].concat(verbose_args_for('pdftex'));
        const pdftex_nonfinal = ['pdflatex', '--draftmode', ...shell_escape_args, '--interaction=batchmode', '--halt-on-error', '--fmt', this.fmt.pdftex, tex_path].concat(verbose_args_for('pdftex'));
        const luahbtex_final = ['luahblatex', '-synctex=1', ...shell_escape_args, '--interaction=nonstopmode', '--halt-on-error', '--output-format=pdf', '--fmt', this.fmt.luahbtex, '--nosocket', tex_path].concat(verbose_args_for('luahbtex'));
        const luahbtex_nonfinal = ['luahblatex', '--draftmode', ...shell_escape_args, '--interaction=nonstopmode', '--halt-on-error', '--fmt', this.fmt.luahbtex, '--nosocket', tex_path].concat(verbose_args_for('luahbtex'));
        const luatex_final = ['lualatex', '-synctex=1', ...shell_escape_args, '--interaction=nonstopmode', '--halt-on-error', '--output-format=pdf', '--fmt', this.fmt.luatex, '--nosocket', tex_path].concat(verbose_args_for('luahbtex'));
        const luatex_nonfinal = ['lualatex', '--draftmode', ...shell_escape_args, '--interaction=nonstopmode', '--halt-on-error', '--fmt', this.fmt.luatex, '--nosocket', tex_path].concat(verbose_args_for('luahbtex'));
        const bibtex8_cmd = ['bibtex8', '--8bit'].concat(verbose_args_for('bibtex8')).concat([aux_path]);
        const makeindex_cmd = ['makeindex', idx_path];
        const xdvipdfmx_cmd = ['xdvipdfmx'].concat(verbose_args_for('xdvipdfmx')).concat(['-o', pdf_path, xdv_path]);

        const driver_cmds = {
            xetex_bibtex8_dvipdfmx: { initial: xetex_cmd, nonfinal: xetex_cmd, final: xetex_cmd, dvi: xdvipdfmx_cmd },
            pdftex_bibtex8: { initial: pdftex_final, nonfinal: pdftex_nonfinal, final: pdftex_final, dvi: null },
            luahbtex_bibtex8: { initial: luahbtex_final, nonfinal: luahbtex_nonfinal, final: luahbtex_final, dvi: null },
            luatex_bibtex8: { initial: luatex_final, nonfinal: luatex_nonfinal, final: luatex_final, dvi: null },
        };

        const { initial, nonfinal, final: final_cmd, dvi } = driver_cmds[driver];
        const logs = [];

        const run = (cmd, error_messages) =>
            this._run_cmd(Module, FS, cmd, error_messages, verbose, log_path, blg_path, aux_path, bbl_path, logs);

        let { exit_code, log: last_log } = run(initial, this.error_messages_fatal);

        let bibtex_ran = false;
        if (exit_code === 0 && bibtex) {
            let bibtex_needed = true;
            if (FS.analyzePath(bbl_path).exists) {
                const aux_content = this.read_all_text(FS, aux_path);
                const citations = (aux_content.match(/\\citation\{[^}]+\}/g) || []).join(';');
                const bibdata = (aux_content.match(/\\bibdata\{[^}]+\}/g) || []).join(';');
                const bibstyle = (aux_content.match(/\\bibstyle\{[^}]+\}/g) || []).join(';');
                let bib_sig = '';
                for (const f of files) {
                    if (f.path && f.path.endsWith('.bib')) {
                        const len = f.contents ? (typeof f.contents === 'string' ? f.contents.length : f.contents.byteLength) : 0;
                        bib_sig += `${f.path}:${len};`;
                    }
                }
                const current_sig = `${citations}|${bibdata}|${bibstyle}|${bib_sig}`;
                if (this._last_bib_sig === current_sig && this.read_all_text(FS, bbl_path).trim() !== '') {
                    bibtex_needed = false;
                } else {
                    this._last_bib_sig = current_sig;
                }
            }

            if (bibtex_needed) {
                if (bib_backend === 'biber' && this.biber != null)
                    exit_code = await this._run_biber(FS, tex_path, files, verbose_args_for('biber'), logs);
                else
                    ({ exit_code } = run(bibtex8_cmd, this.error_messages_fatal));
                bibtex_ran = true;

                if (exit_code === 0 && this.read_all_text(FS, bbl_path).trim() === '') {
                    bibtex = false;
                    bibtex_ran = false;
                }
            }
        }

        const makeindex_enabled = makeindex === null ? true : makeindex;
        let makeindex_active = makeindex_enabled && exit_code === 0 && FS.analyzePath(idx_path).exists && this.read_all_text(FS, idx_path).trim() !== '';
        let makeindex_ran = false;
        if (makeindex_active) {
            ({ exit_code } = run(makeindex_cmd, this.error_messages_fatal));
            makeindex_ran = true;
            if (exit_code === 0 && this.read_all_text(FS, ind_path).trim() === '') {
                makeindex_active = false;
                makeindex_ran = false;
            }
        }

        const rerun_enabled = rerun === null ? true : rerun;
        if (exit_code === 0) {
            const initial_is_final = (initial === final_cmd);
            const needs_rerun = this._needs_rerun(last_log);
            const aux_tools_ran = bibtex_ran || makeindex_ran;

            if (rerun_enabled && (needs_rerun || aux_tools_ran || !initial_is_final)) {
                for (let pass = 0; pass < this.max_tex_passes; pass++) {
                    const is_last_pass = pass === this.max_tex_passes - 1;
                    const cmd = is_last_pass ? final_cmd : (initial_is_final ? final_cmd : nonfinal);
                    const error_messages = is_last_pass ? this.error_messages_all : this.error_messages_fatal;

                    ({ exit_code, log: last_log } = run(cmd, error_messages));
                    if (exit_code !== 0) break;

                    if (!this._needs_rerun(last_log)) {
                        if (cmd !== final_cmd) {
                            ({ exit_code, log: last_log } = run(final_cmd, this.error_messages_all));
                        }
                        break;
                    }
                }
            } else if (!rerun_enabled && !initial_is_final) {
                ({ exit_code, log: last_log } = run(final_cmd, this.error_messages_all));
            }
        }

        if (exit_code === 0 && dvi) {
            ({ exit_code } = run(dvi, this.error_messages_all));
        }

        const pdf = exit_code === 0 ? this.read_all_bytes(FS, pdf_path) : null;
        const synctex = exit_code === 0 ? this.read_all_bytes(FS, tex_path.replace('.tex', '.synctex.gz')) : null;
        const logcat = logs.map(({ log, stdout, stderr }) => [log, stdout, stderr].filter(Boolean).join('\n')).join('\n\n');

        this.Module = this.preload === false ? null : this.Module;

        return { pdf, synctex, log: logcat, exit_code, logs };
    }
}

if (typeof self !== 'undefined') self.BusytexPipeline = BusytexPipeline;