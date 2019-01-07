import URLTools from './urltools';

class PageContent extends H5P.EventDispatcher {
  /**
   * @constructor
   *
   * @param {object} config
   * @param {string} contentId
   * @param {object} contentData
   */
  constructor(config, contentId, contentData, parent, params) {
    super();
    this.parent = parent;
    this.behaviour = config.behaviour;

    this.params = params;
    this.targetPage = {};
    this.targetPage.redirectFromComponent = false;

    this.columnNodes = [];
    this.shouldAutoplay = [];
    this.chapters = [];

    const startChapter = this.createColumns(config, contentId, contentData);
    this.preloadChapter(startChapter);

    this.content = this.createPageContent();

    this.container = document.createElement('div');
    this.container.classList.add('h5p-digibook-main');
    this.container.appendChild(this.content);

    this.parent.on('coverRemoved', () => {
      this.handleChapterChange(this.parent.getActiveChapter());
    });
  }

  /**
   * Get chapters.
   *
   * @return {object[]} Chapters.
   */
  getChapters() {
    return this.chapters;
  }

  /**
   * Create page content.
   *
   * @return {HTMLElement} Page content.
   */
  createPageContent() {
    const content = document.createElement('div');
    content.classList.add('h5p-digibook-content');
    this.columnNodes.forEach(element => {
      content.appendChild(element);
    });

    this.setChapterOrder(this.parent.getActiveChapter());

    return content;
  }

  setChapterOrder(currentId) {
    if (currentId < 0 || currentId > this.columnNodes.length - 1) {
      return;
    }

    this.columnNodes.forEach((element, index) => {
      element.classList.remove('h5p-digibook-previous');
      element.classList.remove('h5p-digibook-current');
      element.classList.remove('h5p-digibook-next');

      if (index === currentId - 1) {
        // element.classList.add('h5p-digibook-previous');
      }
      else if (index === currentId) {
        element.classList.add('h5p-digibook-current');
      }
      else if (index === currentId + 1) {
        // element.classList.add('h5p-digibook-next');
      }
    });
  }

  /**
   * Create page read checkbox.
   *
   * @return {HTMLElement} Checkbox for marking a chapter as read.
   */
  createChapterReadCheckbox() {
    const checkbox = document.createElement('input');
    checkbox.setAttribute('type', 'checkbox');
    checkbox.onclick = (event) => {
      this.parent.setChapterRead(undefined, event.target.checked);
    };

    const checkText = document.createElement('p');
    checkText.innerHTML = this.params.l10n.markAsFinished;

    const wrapper = document.createElement('div');
    wrapper.classList.add('h5p-digibook-status-progress-marker');
    wrapper.appendChild(checkbox);
    wrapper.appendChild(checkText);

    return wrapper;
  }

  /**
   * Inject section instance UUID into DOM.
   *
   * @param {object[]} sections Sections.
   * @param {HTMLElement} columnNode Column element.
   */
  injectSectionId(sections, columnNode) {
    const columnContent = columnNode.getElementsByClassName('h5p-column-content');

    for (let i = 0; i < sections.length; i++) {
      columnContent[i].id = `h5p-digibook-section-${sections[i].instance.subContentId}`;
    }
  }

  /**
   * Preload current chapter and the next one
   * @param {number} chapterIndex
   */
  preloadChapter(chapterIndex) {
    this.initializeChapter(chapterIndex);
    this.initializeChapter(chapterIndex + 1);
  }

  /**
   * Initialize chapter
   * @param {number} chapterIndex
   */
  initializeChapter(chapterIndex) {
    // Out of bound
    if (chapterIndex < 0 || chapterIndex > this.chapters.length - 1) {
      return;
    }

    const chapter = this.chapters[chapterIndex];
    if (!chapter.isInitialized) {
      const columnNode = this.columnNodes[chapterIndex];

      // Attach
      chapter.instance.attach(H5P.jQuery(columnNode));
      this.injectSectionId(chapter.sections, columnNode);

      if (this.behaviour.progressIndicators && !this.behaviour.progressAuto) {
        columnNode.appendChild(this.createChapterReadCheckbox());
      }

      chapter.isInitialized = true;
    }
  }

  /**
   * Create Column instances.
   *
   * @param {object} config Parameters.
   * @param {number} contentId Content id.
   * @param {object} contentData Content data.
   * @return {number} start chapter
   */
  createColumns(config, contentId, contentData) {
    contentData = Object.assign({}, contentData);
    const urlFragments = URLTools.extractFragmentsFromURL(this.parent.validateFragments);
    const chapters = [];
    this.chapters = chapters;

    // Go through all columns and initialise them
    for (let i = 0; i < config.chapters.length; i++) {
      const columnNode = document.createElement('div');
      this.overrideParameters(i, config.chapters[i]);

      const newInstance = H5P.newRunnable(config.chapters[i], contentId, undefined, undefined, contentData);
      this.parent.bubbleUp(newInstance, 'resize', this.parent);

      const chapter = {
        isInitialized: false,
        instance: newInstance,
        title: config.chapters[i].metadata.title,
        completed: false,
        tasksLeft: 0,
        sections: newInstance.getInstances().map(instance => ({
          instance: instance,
          isTask: false
        }))
      };

      columnNode.classList.add('h5p-digibook-chapter');
      columnNode.id = `h5p-digibook-chapter-${newInstance.subContentId}`;

      // Find sections with tasks and tracks them
      if (this.behaviour.progressIndicators) {
        chapter.sections.forEach(section => {
          if (H5P.Column.isTask(section.instance)) {
            section.isTask = true;
            section.taskDone = false;
            chapter.tasksLeft += 1;
          }
        });
      }
      chapter.maxTasks = chapter.tasksLeft;

      // Register both the HTML-element and the H5P-element
      chapters.push(chapter);
      this.columnNodes.push(columnNode);
    }

    // First chapter should be visible, except if the URL says otherwise.
    let chapterUUID = this.columnNodes[0].id;
    let startChapter = 0;
    if (urlFragments.chapter && urlFragments.h5pbookid == this.parent.contentId) {
      const chapterIndex = this.findChapterIndex(urlFragments.chapter);
      startChapter = chapterIndex;
      this.parent.setActiveChapter(chapterIndex);
      chapterUUID = urlFragments.chapter;
      const headerNumber = urlFragments.headerNumber;

      if (urlFragments.section) {
        setTimeout(() => {
          this.redirectSection(urlFragments.section, headerNumber);
          if (this.parent.hasCover()) {
            this.parent.cover.removeCover();
          }
        }, 1000);
      }
    }

    this.columnNodes.forEach(node => {
      if (node.id !== chapterUUID) {
        // node.classList.add('h5p-content-hidden');
      }
    });

    return startChapter;
  }

  /**
   * Redirect section.
   *
   * @param {string} sectionUUID Section UUID or top.
   * @param {number} headerNumber Header index within section
   */
  redirectSection(sectionUUID, headerNumber = null) {
    if (sectionUUID === 'top') {
      this.parent.trigger('scrollToTop');
    }
    else {
      let section = document.getElementById(sectionUUID);

      if (section) {
        if (headerNumber !== null) {
          // find header within section
          const headers = section.querySelectorAll('h2, h3');
          if (headers[headerNumber]) {
            // Set section to the header
            section = headers[headerNumber];
          }
        }

        const focusHandler = document.createElement('div');
        focusHandler.setAttribute('tabindex', '-1');
        section.parentNode.insertBefore(focusHandler, section);
        focusHandler.focus();

        focusHandler.addEventListener('blur', () => {
          focusHandler.parentNode.removeChild(focusHandler);
        });

        this.targetPage.redirectFromComponent = false;
        setTimeout(() => {
          section.scrollIntoView(true);
        }, 100);
      }
    }
  }

  /**
   * Find chapter index.
   *
   * @param {string} chapterUUID Chapter UUID.
   * @return {number} Chapter id.
   */
  findChapterIndex(chapterUUID) {
    let position = -1;
    this.columnNodes.forEach((element, index) => {
      if (position !== -1) {
        return; // Skip
      }
      if (element.id === chapterUUID) {
        position = index;
      }
    });

    return position;
  }

  /**
   * Change chapter.
   *
   * @param {boolean} redirectOnLoad True if should redirect on load.
   * @param {object} target Target.
   */
  changeChapter(redirectOnLoad, target) {
    if (this.columnNodes[this.parent.getActiveChapter()].classList.contains('h5p-digibook-animate')) {
      return;
    }

    this.targetPage = target;
    const chapterIdOld = this.parent.getActiveChapter();
    const chapterIdNew = this.parent.getChapterId(this.targetPage.chapter);

    this.preloadChapter(chapterIdNew);

    if (chapterIdNew < this.columnNodes.length) {
      const oldChapter = this.columnNodes[chapterIdOld];
      const targetChapter = this.columnNodes[chapterIdNew];
      const hasChangedChapter = chapterIdOld !== chapterIdNew;

      if (hasChangedChapter && !redirectOnLoad) {
        this.parent.setActiveChapter(chapterIdNew);

        const direction = (chapterIdOld < chapterIdNew) ? 'next' : 'previous';

        /*
         * Animation done by making the current and the target node
         * visible and then applying the correct translation in x-direction
         */
        targetChapter.classList.add(`h5p-digibook-${direction}`);

        targetChapter.classList.add('h5p-digibook-animate');
        oldChapter.classList.add('h5p-digibook-animate');

        // Start the animation
        setTimeout(() => {
          if (direction === 'previous') {
            oldChapter.classList.add('h5p-digibook-next');
          }
          else {
            oldChapter.classList.remove('h5p-digibook-current');
            oldChapter.classList.add('h5p-digibook-previous');
          }
          targetChapter.classList.remove(`h5p-digibook-${direction}`);
        }, 1);

        // End the animation
        setTimeout(() => {
          oldChapter.classList.remove('h5p-digibook-next');
          oldChapter.classList.remove('h5p-digibook-previous');

          oldChapter.classList.remove('h5p-digibook-current');
          targetChapter.classList.add('h5p-digibook-current');

          targetChapter.classList.remove('h5p-digibook-animate');
          oldChapter.classList.remove('h5p-digibook-animate');

          this.updateFooter();
          this.redirectSection(this.targetPage.section, this.targetPage.headerNumber);

          this.parent.trigger('resize');
        }, 250);

        this.handleChapterChange(chapterIdNew, chapterIdOld);
      }
      else {
        if (this.parent.cover && !this.parent.cover.hidden) {
          this.parent.on('coverRemoved', () => {
            this.redirectSection(this.targetPage.section, this.targetPage.headerNumber);
          });
        }
        else {
          this.redirectSection(this.targetPage.section, this.targetPage.headerNumber);
        }
      }

      this.parent.sideBar.redirectHandler(chapterIdNew);
      if (!redirectOnLoad) {
        this.parent.updateChapterProgress(chapterIdOld, hasChangedChapter);
      }
    }
  }

  /**
   * Update footer.
   */
  updateFooter() {
    const activeChapter = this.parent.getActiveChapter();
    const column = this.columnNodes[activeChapter];
    const hide = this.parent.shouldFooterBeHidden(column.clientHeight);
    this.parent.statusBarFooter.setVisibility(hide);
  }

  /**
   * Handles chapter change events.
   *
   * @param {number} newId
   * @param {number} oldId
   */
  handleChapterChange(newId, oldId) {
    let i;
    if (oldId !== undefined) {
      // Stop any playback
      for (i = 0; i < this.chapters[oldId].sections.length; i++) {
        this.pauseMedia(this.chapters[oldId].sections[i].instance);
      }
    }

    // Start autoplay
    if (this.shouldAutoplay[newId]) {
      for (i = 0; i < this.shouldAutoplay[newId].length; i++) {
        const shouldAutoplay = this.shouldAutoplay[newId][i];
        if (this.chapters[newId].sections[shouldAutoplay] !== undefined) {
          this.chapters[newId].sections[shouldAutoplay].instance.play();
        }
      }
    }
  }

  /**
   * Disables autoplay for all interactions not on the first chapter.
   *
   * @param {number} chapterId
   * @param {Object} chapter
   */
  overrideParameters(chapterId, chapter) {
    const currentChapterId = this.parent.getActiveChapter();
    for (let i = 0; i < chapter.params.content.length; i++) {
      if (this.hasAutoplay(chapter.params.content[i].content.params, chapterId !== currentChapterId || this.parent.hasCover())) {
        if (this.shouldAutoplay[chapterId] === undefined) {
          this.shouldAutoplay[chapterId] = [i];
        }
        else {
          this.shouldAutoplay[chapterId].push(i);
        }
      }
    }
  }

  /**
   * Check if interaction has autoplay enabled
   *
   * @param {Object} params
   * @return {boolean}
   */
  hasAutoplay(params, prevent) {
    if (params.autoplay) {
      if (prevent) {
        params.autoplay = false;
      }
      return true;
    }
    else if (params.playback && params.playback.autoplay) {
      if (prevent) {
        params.playback.autoplay = false;
      }
      return true;
    }
    else if (params.media && params.media.params &&
             params.media.params.playback &&
             params.media.params.playback.autoplay) {
      if (prevent) {
        params.media.params.playback.autoplay = false;
      }
      return true;
    }
    else if (params.media && params.media.params &&
             params.media.params.autoplay) {
      if (prevent) {
        params.media.params.autoplay = false;
      }
      return true;
    }
    return false;
  }

  /**
   * Stop the given element's playback if any.
   *
   * @param {object} instance
   */
  pauseMedia(instance) {
    try {
      if (instance.pause !== undefined &&
          (instance.pause instanceof Function ||
            typeof instance.pause === 'function')) {
        instance.pause();
      }
      else if (instance.video !== undefined &&
               instance.video.pause !== undefined &&
               (instance.video.pause instanceof Function ||
                 typeof instance.video.pause === 'function')) {
        instance.video.pause();
      }
      else if (instance.stop !== undefined &&
               (instance.stop instanceof Function ||
                 typeof instance.stop === 'function')) {
        instance.stop();
      }
    }
    catch (err) {
      // Prevent crashing, but tell developers there's something wrong.
      H5P.error(err);
    }
  }

  /**
   * Toggle main content visibility.
   */
  toggle() {
    this.content.classList.toggle('hidden');
  }
}

export default PageContent;
