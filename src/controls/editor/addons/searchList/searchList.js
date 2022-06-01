import Awesomplete from 'awesomplete';
import fetchImg from './utils/fetchImg';
import awesomeImage from './utils/awesomeImage';
import awesomeParser from './utils/awesomeParser';
import makeEmptyList from './utils/makeEmptyList';
import moveBtn from './utils/moveBtn';
import spinner from '../../../../utils/spinner';

/** Default user message. Can be overriden by config. */
const hintTypeMore = 'Skriv fler tecken';
/** Default user message. Can be overriden by config. */
const hintNoHits = 'Inga träffar';

/**
 * Helper to escape strings for regex
 * @param {any} v
 */
const regEscape = v => v.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');

/**
 * Function that filters items based on input. Same as awesome default filter, but only searches value to avoid getting hits in html when having img labels.
 * @param {any} text
 * @param {any} input
 */
function filter(text, input) {
  return RegExp(regEscape(input.trim()), 'i').test(text.value);
}

/**
 * Function used by awesome to build the list item html with highlighted search string
 * Supports images
 * @param {any} text
 * @param {any} itemInput
 */
function imageItemFormatter(text, itemInput) {
  let labelTxt = text.label;

  if (itemInput !== '') {
    // Make sure we only replace text in the text, not html tags.
    const el = document.createElement('div');
    el.innerHTML = text.label;
    const labelEl = el.querySelector('p');
    if (labelEl) {
      labelTxt = labelEl.innerHTML;
    }
    labelTxt = labelTxt.replace(RegExp(regEscape(itemInput.trim()), 'gi'), '<mark>$&</mark>');
    if (labelEl) {
      labelEl.innerHTML = labelTxt;
      labelTxt = el.innerHTML;
    }
  }

  // Create a list item containing the marked letters
  const item = document.createElement('li');
  item.innerHTML = labelTxt;
  item.setAttribute('aria-selected', false);
  return item;
}

/**
 * Makes an input an awesome autocomplete widget
 * @param {any} input The input to make into awesome
 * @param {Object} conf.config An object with the documented searchList configuration.
 * @param {Object} conf.list The list of suggestions. Optional for remote list
 */
function searchList(input, conf) {
  /** The list of items set to awesome */
  let olist = conf.list || [];
  const searchListConfig = conf.config;
  // Set up default config for awesome
  const awesomeConfig = {
    minChars: searchListConfig.minChars,
    maxItems: searchListConfig.maxItems,
    filter,
    item: imageItemFormatter
  };

  if (searchListConfig.allowOnlyFromList) {
    awesomeConfig.autoFirst = true;
  }

  // Set up awesomeconfiguration for dynamic mode overriding some stuff set up earlier
  if (searchListConfig.dynamic) {
    awesomeConfig.filter = () => true;
    awesomeConfig.sort = false;
  }
  if (!searchListConfig.url) {
    // Plain old static configuration.

    // Location is not supported in URL mode as it does not make sense to get configuration from a configuration service.
    // FIXME: this is probably unintended. For location to work, only one element can exist
    const hasLocation = olist.length > 0 && olist.reduce(o => Object.keys(o).includes('location'));
    if (hasLocation) {
      olist.forEach((oItem) => {
        fetchImg((images) => {
          images.map((item) => {
            // olist is a reference to awesome config, so this push in to awesome when response arrives
            olist.push({
              label: awesomeImage(item.src, item.value).outerHTML,
              value: item.value
            });
            return true;
          });
        }, oItem);
      });
      // Filter out the location object.
      // FIXME: this is probably unintended as it is not possible to actually combine location and other config.
      olist = olist.filter(obj => obj.src);
    } else {
      olist = awesomeParser(olist);
    }
    awesomeConfig.list = olist;
  }
  /** Keep track of ongoing requests */
  let abortControllers = [];
  /**
   * Calls the remote server
   * @param {any} url Url to call.
   * @returns An array of suggestions
   */
  async function getSuggestionsFromRemote(url) {
    let list = [];
    let myController;
    // Abort requests (if any) as we won't wait for the response anyway
    abortControllers.forEach(ctrl => {
      ctrl.abort();
    });
    try {
      myController = new AbortController();
      abortControllers.push(myController);
      const res = await fetch(url, {
        method: 'GET',
        signal: myController.signal
      });
      list = await res.json();
    } catch (ex) {
      if (ex.name === 'AbortError') {
        // Return null to indicate that we were aborted
        return null;
      }

      throw ex;
    } finally {
      // Remove ourself from ongoing requests
      abortControllers = abortControllers.filter(item => item !== myController);
    }
    return list;
  }

  /** Workaround to keep track of if the open button was pressed when awesome was closed */
  let supressOpen;
  /** Remember last value so it can be reset when allowOnlyFromList */
  let lastValidinput = input.value;

  const container = input.closest('.searchList');
  const btn = container.querySelector('button');

  // Must be added before awesome is created otherwise awesome handler runs first and sets opened to false before we get the chance to check it.
  input.addEventListener('blur', (e) => {
    // just to avoid several lint errors
    // In true javascript magic the awesome variable will exist when this eventhandler is called.
    // eslint-disable-next-line no-use-before-define
    const awe = awesome;
    if (e.relatedTarget === btn && awe.opened) {
      supressOpen = true;
    }
    if (e.relatedTarget !== btn && searchListConfig.allowOnlyFromList) {
      // eslint-disable-next-line no-param-reassign
      input.value = lastValidinput;
    }
    // eslint-disable-next-line no-use-before-define
    hideMessage();
  });

  // Must be added  before awesome is created otherwise awesome list will open on select by enter
  input.addEventListener('keydown', (e) => {
    // just to avoid several lint errors
    // In true javascript magic the awesome variable will exist when this eventhandler is called.
    // eslint-disable-next-line no-use-before-define
    const awe = awesome;
    if (e.key === 'Enter') {
      if (!awe.opened) {
        // eslint-disable-next-line no-use-before-define
        openMenu();
        // Avoid awesome selecting
        e.stopImmediatePropagation();
      }
    }
    // Reset min chars if user opened full list at some point.
    awe.minChars = searchListConfig.minChars;
  });

  // Create the awesome object
  const awesome = new Awesomplete(input, awesomeConfig);
  // Move the button before UL after swesome has rearranged DOM. Probably to make CSS styling easier.
  moveBtn(btn);
  const emptyList = makeEmptyList(awesome.container);

  /**
   * Sets the user hint
   * @param {any} text
   */
  function setMessage(text) {
    emptyList.innerHTML = text;
    emptyList.parentElement.hidden = false;
  }

  /** Hides the user hint */
  function hideMessage() {
    emptyList.parentElement.hidden = true;
  }

  /** Determins if the should be a user hint */
  function evaluateEmptyList() {
    if (input.value.length === 0) {
      hideMessage();
    } else if (input.value.length < awesome.minChars) {
      setMessage(searchListConfig.typeMoreText || hintTypeMore);
    } else if (!awesome.opened) {
      setMessage(searchListConfig.noHitsText || hintNoHits);
    }
  }

  /**
   * Fetches from remote server
   * @param {any} inputText optional. If provided a qeury parameter is added with the inputText as value
   */
  function getDynamic(inputText) {
    let url = searchListConfig.url;
    url += url.includes('?') ? '&' : '?';
    url += `${(searchListConfig.queryParameter || 'input')}=${encodeURIComponent(inputText)}`;
    setMessage(spinner().outerHTML);
    awesome.list = [];
    getSuggestionsFromRemote(url).then(list => {
      // If list is null, request was aborted beacuse another request was sent before this was finished.
      // Only need to update if request actually returns something
      if (list) {
        awesome.list = awesomeParser(list);
        awesome.evaluate();
        evaluateEmptyList();
      }
    })
      .catch(e => {
        console.error(e);
        alert('Autocompleteservern svarar inte');
        hideMessage();
      });
  }

  /**
 * Helper that opens the dropdown with entire list if input is empty
 */
  function openMenu() {
    // The supress stuff is when already open before klicking and aewsome closes on blur
    if (!supressOpen) {
      if (input.value.length === 0 && !searchListConfig.disallowDropDown) {
        awesome.minChars = 0;
        if (searchListConfig.dynamic) {
          getDynamic('');
        }
      } else if (searchListConfig.dynamic) {
        getDynamic(input.value);
      }
      awesome.evaluate();
    }
    supressOpen = false;
  }

  // Load the remote list into awesome if configured to do so
  if (searchListConfig.url && !searchListConfig.dynamic) {
    const url = searchListConfig.url;
    setMessage(spinner().outerHTML);
    awesome.list = [];
    getSuggestionsFromRemote(url).then(list => {
      awesome.list = awesomeParser(list);
      hideMessage();
    })
      .catch(e => {
        console.error(e);
        alert('Autocompleteservern svarar inte');
        hideMessage();
      });
  }

  // Set up handler to query server on every keypress in dynamice mode
  // Server is assumed to return only pre-filtered and sorted hits, but awesome may truncate it according to maxItems.
  input.addEventListener('input', (e) => {
    // Select in list does not trigger input, so we don't have to ignore those

    evaluateEmptyList();

    if (searchListConfig.dynamic) {
      const inputValue = e.target.value;
      if (inputValue.length < awesome.minChars) {
        return;
      }
      getDynamic(inputValue);
    }
  });

  // Open the list and give focus to input instead when drop down button is pressed.
  btn.addEventListener('click', () => {
    // Only open. awesome closes automatically on blur
    openMenu();
    input.focus();
  });

  // Event handler for when awesome closes.
  awesome.input.addEventListener('awesomplete-close', (e) => {
    if (searchListConfig.allowOnlyFromList && e.reason !== 'select' && e.reason !== 'nomatches') {
      // eslint-disable-next-line no-param-reassign
      input.value = lastValidinput;
      hideMessage();
    }
    if (e.reason === 'select') {
      // Save a new last value if rollback is performed later
      // eslint-disable-next-line no-param-reassign
      lastValidinput = input.value;
    }
  });

  // Add an eventlistener for kepresses.
  input.addEventListener('keyup', (e) => {
    if (e.key === 'Escape') {
      awesome.close();
      if (searchListConfig.allowOnlyFromList) {
        // Reset input
        // eslint-disable-next-line no-param-reassign
        input.value = lastValidinput;
      }
      hideMessage();
    }
  });

  awesome.input.addEventListener('awesomplete-open', () => {
    hideMessage();
  });
}

export default searchList;
