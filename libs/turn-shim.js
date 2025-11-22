/*
 Minimal turn.js shim for this demo.
 Provides a small jQuery plugin `.turn()` that accepts init options and exposes 'next'/'previous' methods.
 This is NOT full turn.js — it's a tiny compatibility shim that uses the existing pager fallback and animations.
*/
(function($){
  $.fn.turn = function(arg){
    // if called as method
    if(typeof arg === 'string'){
      const method = arg;
      const $fb = this;
      if(method === 'next'){
        // try to call internal handler if present
        if($fb.data('turn-next')){ $fb.data('turn-next')(); }
        else {
          // fallback: trigger click on next button
          $('#tj-next').trigger('click');
        }
      }
      if(method === 'previous' || method === 'prev'){
        if($fb.data('turn-prev')){ $fb.data('turn-prev')(); }
        else $('#tj-prev').trigger('click');
      }
      return this;
    }

    // initialize
    const options = arg || {};
    const $fb = this;
    // store trivial API methods that call buttons (the demo wires buttons to pager)
    $fb.data('turn-next', ()=> { $('#tj-next').trigger('click'); });
    $fb.data('turn-prev', ()=> { $('#tj-prev').trigger('click'); });

    // return jq object
    return this;
  };
})(jQuery);
