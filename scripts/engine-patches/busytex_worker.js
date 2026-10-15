importScripts('busytex_biber.js');
importScripts('busytex_pipeline.js');

self._newlyFetchedRemoteFiles = [];
self._newlyFetchedRemoteMisses = [];

(function installFastXhrInterceptor() {
    if (typeof XMLHttpRequest === 'undefined') return;

    const xhrMemoryCache = new Map();
    const IMAGE_OR_AUX_EXT = /\.(?:jpe?g|png|gif|webp|svg|eps|bmp|aux|toc|lof|lot|bbl|out|log)$/i;

    const origOpen = XMLHttpRequest.prototype.open;
    const origSend = XMLHttpRequest.prototype.send;
    const origGetResponseHeader = XMLHttpRequest.prototype.getResponseHeader;

    XMLHttpRequest.prototype.open = function (method, url, async, user, password) {
        this._teeexUrl = typeof url === 'string' ? url : String(url);
        this._teeexMethod = method;
        this._teeexShortCircuit = null;

        if (this._teeexUrl.includes('/api/texlive/') || this._teeexUrl.includes('texlive2026.texlyre.org')) {
            if (IMAGE_OR_AUX_EXT.test(this._teeexUrl)) {
                this._teeexShortCircuit = { status: 404, buffer: new ArrayBuffer(0), text: '', headers: {} };
                return;
            }
            const cached = xhrMemoryCache.get(this._teeexUrl);
            if (cached) {
                this._teeexShortCircuit = cached;
                return;
            }
        }

        return origOpen.call(this, method, url, async !== false, user, password);
    };

    XMLHttpRequest.prototype.getResponseHeader = function (name) {
        if (this._teeexShortCircuit) {
            return this._teeexShortCircuit.headers[name.toLowerCase()] || null;
        }
        return origGetResponseHeader.call(this, name);
    };

    XMLHttpRequest.prototype.send = function (body) {
        if (this._teeexShortCircuit) {
            const hit = this._teeexShortCircuit;
            Object.defineProperty(this, 'status', { value: hit.status, configurable: true });
            Object.defineProperty(this, 'readyState', { value: 4, configurable: true });
            Object.defineProperty(this, 'response', { value: this.responseType === 'arraybuffer' ? hit.buffer : hit.text, configurable: true });
            Object.defineProperty(this, 'responseText', { value: hit.text, configurable: true });
            if (typeof this.onload === 'function') this.onload();
            if (typeof this.onreadystatechange === 'function') this.onreadystatechange();
            return;
        }

        if (this._teeexUrl && (this._teeexUrl.includes('/api/texlive/') || this._teeexUrl.includes('texlive2026.texlyre.org'))) {
            origOpen.call(this, this._teeexMethod || 'GET', this._teeexUrl, false);
        }

        origSend.call(this, body);

        if (this._teeexUrl && (this._teeexUrl.includes('/api/texlive/') || this._teeexUrl.includes('texlive2026.texlyre.org'))) {
            if (this.status === 200 || this.status === 404) {
                let buf = new ArrayBuffer(0);
                let txt = '';
                try {
                    if (this.response instanceof ArrayBuffer) {
                        buf = this.response.slice(0);
                    } else if (typeof this.responseText === 'string') {
                        txt = this.responseText;
                        buf = new TextEncoder().encode(txt).buffer;
                    }
                } catch { }
                xhrMemoryCache.set(this._teeexUrl, {
                    status: this.status,
                    buffer: buf,
                    text: txt,
                    headers: {
                        'fileid': origGetResponseHeader.call(this, 'fileid') || '',
                        'content-type': origGetResponseHeader.call(this, 'content-type') || 'application/octet-stream',
                    },
                });

                // Extract format & filename so BusytexPipeline bakes it into C++ kpathsea RAM
                const m = this._teeexUrl.match(/\/(\d+)\/([^/?#]+)$/);
                if (m) {
                    const fmt = Number(m[1]);
                    const fname = decodeURIComponent(m[2]);
                    if (this.status === 200 && buf.byteLength > 0) {
                        self._newlyFetchedRemoteFiles.push({
                            name: fname,
                            format: fmt,
                            bytes: new Uint8Array(buf),
                        });
                    } else if (this.status === 404) {
                        self._newlyFetchedRemoteMisses.push(`${fmt}/${fname}`);
                    }
                }
            }
        }
    };
})();

self.pipeline = null;

onmessage = async ({ data: { files, main_tex_path, bibtex, biber, makeindex, rerun, busytex_wasm, busytex_js, biber_js, biber_wasm, biber_data, preload_data_packages_js, data_packages_js, texmf_local, preload, verbose, driver, remote_endpoint, shell_escape, clean, load_shell_handler_script, read_project_files, write_texlive_remote_files, write_texlive_remote_misses } }) => {
    if (busytex_wasm && busytex_js && preload_data_packages_js) {
        try {
            self.pipeline = new BusytexPipeline(
                busytex_js,
                busytex_wasm,
                data_packages_js,
                preload_data_packages_js,
                texmf_local,
                msg => postMessage({ print: msg }),
                applet_versions => postMessage({ initialized: applet_versions }),
                preload,
                BusytexPipeline.ScriptLoaderWorker,
                biber_js,
                biber_wasm,
                biber_data
            );
        } catch (err) {
            postMessage({ exception: 'Exception during initialization: ' + err.toString() + '\nStack:\n' + err.stack });
        }
    } else if (load_shell_handler_script) {
        try {
            importScripts(load_shell_handler_script);
            if (self.handler_ready) await self.handler_ready;
            postMessage({ shell_handler_script_loaded: load_shell_handler_script });
        } catch (err) {
            postMessage({ exception: 'Exception loading shell handler script: ' + err.toString() + '\nStack:\n' + err.stack });
        }
    } else if (read_project_files && self.pipeline) {
        try {
            postMessage({ project_files: await self.pipeline.read_project_files(read_project_files.dir || null) });
        } catch (err) {
            postMessage({ exception: 'Exception reading project files: ' + err.toString() + '\nStack:\n' + err.stack });
        }
    } else if (write_texlive_remote_files && self.pipeline) {
        try {
            await self.pipeline.write_texlive_remote_files(write_texlive_remote_files);
            postMessage({ texlive_remote_written: true });
        } catch (err) {
            postMessage({ exception: 'Exception writing remote files: ' + err.toString() + '\nStack:\n' + err.stack });
        }
    } else if (write_texlive_remote_misses && self.pipeline) {
        try {
            await self.pipeline.write_texlive_remote_misses(write_texlive_remote_misses);
            postMessage({ texlive_remote_misses_written: true });
        } catch (err) {
            postMessage({ exception: 'Exception writing remote misses: ' + err.toString() + '\nStack:\n' + err.stack });
        }
    } else if (files && self.pipeline) {
        try {
            const result = await self.pipeline.compile(
                files,
                main_tex_path,
                bibtex,
                biber,
                makeindex,
                rerun,
                verbose,
                driver,
                data_packages_js,
                remote_endpoint,
                shell_escape === true,
                clean === true
            );

            const transferables = [];
            if (result.pdf && result.pdf.buffer && result.pdf.byteLength > 0) {
                transferables.push(result.pdf.buffer);
            }
            if (result.synctex && result.synctex.buffer && result.synctex.byteLength > 0) {
                transferables.push(result.synctex.buffer);
            }

            postMessage(result, transferables);
        } catch (err) {
            postMessage({ exception: 'Exception during compilation: ' + err.toString() + '\nStack:\n' + err.stack });
        }
    }
};